"use strict";

var instadate = require("instadate");
var yaml = require('js-yaml');
var moment = require("moment");
var fedHolidays = require('@18f/us-federal-holidays');
var Q = require('q');
var _ = require("underscore");

var d = new Date();
var holidays = fedHolidays.allForYear(d.getFullYear());

var MyTrello = require("./my-trello.js");


class CardRecorder extends MyTrello {
    constructor(yaml_file, board) {
        super(yaml_file, board);
        this.stages = this.getPreAward();
    }

    run() {
        var self = this;
        var deferred = Q.defer();
        this.getUpdateCards().then(function(cards) {
            _.each(cards, function(card) {
                var comments = _.filter(card.actions, {type: "commentCard"});
                self.deleteCurrentComment(comments).then(function(resp) {
                    var updateActions = _.filter(card.actions, {type: "updateCard"});
                    var createAction = _.filter(card.actions, {type: "createCard"});
                    var now = moment();
                    var hasMoved = false;
                    var daysSinceUpdate = false;
                    if(typeof updateActions !== "undefined"){
                      hasMoved = self.hasMovedCheck(updateActions);
                      daysSinceUpdate = now.diff(moment(updateActions[0].date), 'days');
                    }
                    var lastMove = self.findLastMoveDateFromComments({commentList: comments, "actionList": updateActions, "createActionDate": createAction.date});
                    if (hasMoved && daysSinceUpdate < 1) {
                        console.log("Write New Phase: " + card.name);
                        var lastPhase = self.getLastList(hasMoved[0]);
                        self.compileCommentArtifact(
                            card.id,
                            lastPhase,
                            lastPhase,
                            lastMove,
                            updateActions[0].date,
                            true
                        )
                        .then(deferred.resolve);
                    } else {
                        console.log("Write Current Phase: " + card.name);
                        self.getListNameByID(card.idList).then(function(listName) {
                            self.compileCommentArtifact(
                                card.id,
                                listName,
                                "Current",
                                lastMove,
                                now.format(),
                                true
                            )
                        })
                        .then(deferred.resolve);
                    }
                });
            });
        })
        // .fail(function(err){console.log(err.stack)});
        return deferred.promise;
    }

    getUpdateCards() {
        var deferred = Q.defer();
        var url = '/1/boards/' + this.board + '/cards';

        this.t.get(url, { actions: ["createCard", "updateCard", "commentCard"] }, function(err, cards) {
            if (err) return deferred.reject(err);
            deferred.resolve(cards);
        });

        return deferred.promise;
    }

    deleteCurrentComment(comments) {
        var deferred = Q.defer(),
        currentCommentID = "",
        self = this;

        _.each(comments, function(c) {
            if (c.data.text.indexOf("**Current Stage:**") !== -1) {
                currentCommentID = c.id;
            }
        });

        if (currentCommentID !== "") {
            self.t.del('/1/actions/' + currentCommentID, function(err, data) {
                if (err) deferred.reject(new Error(err));
                deferred.resolve({"currentCommentDeleted": true});
            });
        } else {
            deferred.resolve({"currentCommentDeleted": false});
        }

        return deferred.promise;
    }

    findLastMoveDateFromComments(opts){
      var actionList = opts.actionList;
      var cardCreationDate = opts.cardCreationDate;
      var commentList = opts.commentList;
      // var commentDate = _.find(commentList, function(comment){ return comment.match( /(\d\d\/\d\d\/201\d) - \d\d\/\d\d\/201\d/ )});
      var myRegex = /(\d\d\/\d\d\/201\d) - \d\d\/\d\d\/201\d/;
      if(commentList){
        var correctComment = _.find(commentList, function(comment){
            var match = myRegex.exec(comment.data.text);
            return match ? match[1] : false;
        });

      }
      if(correctComment){
        var commentDateMatch = myRegex.exec(correctComment.data.text);
        var commentDate = commentDateMatch[1];
        return moment(commentDate, "MM/DD/YYYY").toISOString();
      } else if(actionList) {
        if(actionList.length > 1){
        return actionList[0].date;
        }
      } else {
        if(opts.cardCreationDate){
          return cardCreationDate;
        } else {
          return moment("01/01/2016", "MM/DD/YYYY").toISOString();
        }
      }
    }

    hasMovedCheck(actionList) {
        var updated = false;
        var moves = _.filter(actionList, function(a) {
            return 'listBefore' in a.data;
        });
        if (moves.length) updated = moves;
        return updated;
    }

    getLastList(cardAction) {
        return cardAction.data.listBefore.name;
    }

    compileCommentArtifact(cardID, dateList, nameList, fromDate, toDate, addCommentOpt) {
        var deferred = Q.defer();
        var stage = _.findWhere(this.stages, { name: dateList });
        var expectedTime = stage.expected_time;
        var diffArray = this.calculateDateDifference(expectedTime, fromDate, toDate);
        var differenceFromExpected = diffArray[0];
        var timeTaken = diffArray[1];
        var comment = this.buildComment(differenceFromExpected, expectedTime, fromDate, toDate, nameList, timeTaken);

        if (addCommentOpt) {
            this.addComment(comment, cardID).then(function(resp){deferred.resolve(resp)});
        } else {
            deferred.resolve(comment);
        }
        return deferred.promise;
    }

    findHolidaysBetweenDates(fromDate, toDate){
      var count = 0;
      _un.each(holidays, function(holiday){
        if(moment(holiday.dateString, ["YYYY-M-D", "YYYY-MM-DD", "YYYY-MM-D", "YYYY-M-DD"]).isBetween(fromDate, toDate, 'day')){
          count++;
        }
      });
      return count;
    }

    calculateDateDifference(expected, lastMove, recentMove) {
        var fromDate = new Date(lastMove);
        var toDate = new Date(recentMove);
        var diffDays = instadate.differenceInWorkDays(fromDate, toDate);
        var diffDays = diffDays - this.findHolidaysBetweenDates(fromDate, toDate);
        return [diffDays - expected, diffDays];
    }

    buildComment(dateDiff, expected, lastMove, recentMove, lastList, actual) {
        var formatDiff = (dateDiff < 0) ? "**" + dateDiff + " days**" : "`+" + dateDiff + " days`";
        var fromDate = moment(lastMove).format("L");
        var toDate = moment(recentMove).format("L");
        return `**${lastList} Stage:** ${formatDiff}. *${fromDate} - ${toDate}*.\n Expected days: ${expected} days. Actual Days spent: ${actual}.`;
    }

    addComment(message, cardID) {
        var deferred = Q.defer();
        var url = "1/cards/" + cardID + "/actions/comments";

        this.t.post(url, { text: message }, function(err, data) {
            if (err) return deferred.reject(err);
            deferred.resolve(data);
        });

        return deferred.promise;
    }
}


module.exports = CardRecorder;
