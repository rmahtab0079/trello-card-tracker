expect = require('chai').expect
_un = require("underscore")
app = require('../app')
#
# board = process.env.TRELLO_BPA_TEST_BOARD
# mockfile = './test/mockfile.yaml'
#
helpers = require('./test-helpers.js')
#
# board_url = '/1/boards/' + board + '/lists'
#
# stubbed_list = ["Kanbanian", "Kanbanian-Dos"]
#
# make_lists = [ { stage: 'Kanbanian', built: false },
# { stage: 'Kanbanian-Dos', built: false }]
#
# expectedStageObject =
#   stages: [ {
#     name: 'Pre-Award'
#     substages: [
#       {
#         name: 'IAA'
#         expected_time: 5
#       }
#       {
#         name: 'Workshop Prep'
#         expected_time: 10
#       }
#     ]
#   } ]

stages = helpers.expectedStageObject.stages[0].substages
# console.log stages
stageMgr = new app.StageManager(helpers.mockfile, helpers.board)

describe 'stageManager', ->
  describe '.readYAML', ->
    it 'maps a yaml to an object with a stages key', ->
      yamlObject = stageMgr.readYaml()
      expect(yamlObject).to.eql(helpers.expectedStageObject)
      return
    return

  describe '.checkLists', -> # skipping because testing async fxn callback...boooo
    it 'checks which stages in an object of stages are in a trello board', ->
      expected_object = ["Kanbanian", "Kanbanian-Dos"]
      stageMgr.checkLists(helpers.stubbed_list, testCallback)
      testCallback = (checkedList) ->
        stgs = _un.pluck(checkedList, 'name')
        expect(checkedListg).to.eql expected_list
        return
      # expect(result_object).to.include.members(expected_object);
      return
    return

  describe '.makeAdditionalLists', ->
    it 'given a list of objects that include the name of unbuilt lists, it makes additional lists in trello', ->
      stageMgr.makeAdditionalLists(helpers.make_lists)
      stageMgr.t.get helpers.board_url, (err, data) ->
        if err
          throw err
        boardLists = _un.pluck(data, 'name')
        expect(boardLists).to.include.members(helpers.stubbed_list)
        return
      return
    return

  describe '.orderLists', ->
    it 'reorders the list to match with the order of the stages', ->
      stageMgr.orderLists([helpers.stages, [{}]])
      stageMgr.t.get helpers.board_url, (err, data) ->
        if err
          throw err
        _un.each helpers.stages, (stage, ind) ->
          trelloList = _un.findWhere(data, {name: helpers.stages["name"]})
          expect(ind).to.eql(trelloList["pos"])
          return
        return
      return
    return

  describe '.closeUnusedStages', ->
    it 'closes a lists given a list if it is not in a stages object where there are no cards', ->
      stageMgr.closeUnusedStages([helpers.stages, [{}]])
      stageMgr.t.get helpers.board_url, (err, data) ->
        if err
          throw err
        shouldbeClosed = _un.findWhere(data, {name: 'Should be closed board'})
        expect(shouldbeClosed["closed"]).to.be.true
        # console.log data
      return
  return