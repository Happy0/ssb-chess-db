const FlumeReduce = require('flumeview-reduce')
const pull = require( 'pull-stream' )
const iterable = require( 'pull-iterable' )
const deferred = require('pull-defer');

const pullScan = require('pull-scan');

exports.name = 'ssbChessIndex'
exports.version = require('./package.json').version

/*
 * mux-rpc manifest to document the functions that are offered by this
 * scuttlebot plugin
*/
exports.manifest = {
  pendingChallengesSent: 'async',
  pendingChallengesReceived: 'async',
  getGamesAgreedToPlayIds: 'async',
  getObservableGames: 'async',

  getGamesFinished: 'source'
}

const indexVersion = 2;
const chessTypeMessages = ["chess_invite", "chess_invite_accept", "chess_game_end"];

const INVITER_FIELD = 'i';
const INVITEE_FIELD = "in";
const INVITER_COLOUR_FIELD = 'c';
const STATUS_FIELD = 's';
const WINNER_FIELD = 'w'
const UPDATED_FIELD = 'u';

const STATUS_INVITED = 'invited';
const STATUS_STARTED = 'started';

/**
 * A scuttlebot plugin which creates an index of all chess games in the database
 * and exposes handy functions for querying them.
 */
exports.init = function (ssb, config) {

  const view = ssb._flumeUse('ssb-chess-index',
    FlumeReduce(
      indexVersion,
      flumeReduceFunction,
      flumeMapFunction
    )
  )

  return {
    pendingChallengesSent: (id, cb) => withView(view, cb, pendingChallengesSent.bind(null, id)),
    pendingChallengesReceived: (id, cb) => withView(view, cb, pendingChallengesReceived.bind(null, id)),
    getGamesAgreedToPlayIds: (id, cb) => withView(view, cb, getGamesAgreedToPlayIds.bind(null, id)),
    getObservableGames: (id, cb) => withView(view, cb, getObservableGames.bind(null, id)),

    /**
     * Emits a new list of games that the given player (by playerId) is playing
     * if there are any changes (such as the player starting a new game or finishing
     * a current one.)
     */
    getGamesAgreedToPlayIdStream: (playerId) => {
      var indexChangeStream = view.stream({live: true});
      var getCurrentPlayerGames = () => pull.asyncMap(getGamesAgreedToPlayIds.bind(null, id));

      var emitOnlyChanges = pullFilterOnlyIfChange(getCurrentPlayerGames, listsDiffer);

      return pull(indexChangeStream, emitOnlyChanges)
    },
    getGamesFinished: (playerId) => {
      var source = deferred.source();

      view.get( (err, index) => {
        if (err) {
          source.abort(err)
        } else {
          var finishedGamesIter = iterable(finishedGamesIterable(playerId, index));
          source.resolve(finishedGamesIter)
        }
      })

      return source;
    }
  }
}

function listsDiffer(list1, list2) {
  return list1.filter(function(i) {return list2.indexOf(i) < 0;}).length > 0;
}

/**
 * When a new value is emitted from the given pull stream source, if it
 * is different from the last value emitted it will be emitted by this 'through',
 * otherwise it will be filtered from the stream

 * @comparerFn (a, b) => Bool . A function that can compare two values and
                         returns true if they indicate changes have been made
                         and false otherwise.
 * @return A new pull-stream source.
 */
function pullFilterOnlyIfChange(source, comparerFn) {

  var scanFn = (acc, next) => {
    return [acc, next];
  }

  var filterFn = (pair) => comparerFn(pair[0], pair[1]);

  // Return the 'next' value
  var mapFn = (pair) => pair[1]

  var ifChangesFilter = pull(pullScan(filterFn), pull.filter(filterFn));
  var emitOnlyIfChanged = map(ifChangesFilter, mapFn);

  return pull(source, emitOnlyIfChanged);
}


function gameHasUser(gameInfo, playerId) {
  return gameInfo[INVITEE_FIELD] === playerId || gameInfo[INVITER_FIELD] === playerId
}

function* finishedGamesIterable(playerId, view) {
  var result = [];

  for (var k in view) {
    if (view.hasOwnProperty(k)) {
      var summary = view[k];
      if (summary[STATUS_FIELD] != STATUS_INVITED && summary[STATUS_FIELD]
           != STATUS_STARTED && gameHasUser(summary, playerId)) {
             yield k;
           }
    }

  }

}

function withView(view, cb, func) {
  view.get( (err, result) => {

    if (err) {
      cb(err, null);
    } else {
      cb(null, func(result));
    }

  });
}

function pendingChallengesSent(playerId, view) {
  var result = [];

  for (var k in view) {
       if (view.hasOwnProperty(k)) {
         var gameInfo = view[k];

         if (gameInfo[INVITER_FIELD] === playerId && gameInfo[STATUS_FIELD] === STATUS_INVITED) {
            var invite = getInviteSummary(k, gameInfo);

            result.push(invite)
         }
       }
   }

   return result;
}

function pendingChallengesReceived(playerId, view) {
  var result = [];

  for (var k in view) {
       if (view.hasOwnProperty(k)) {
         var gameInfo = view[k];
         if (gameInfo[INVITEE_FIELD] === playerId && gameInfo[STATUS_FIELD] === STATUS_INVITED) {
            var invite = getInviteSummary(k, gameInfo);

            result.push(invite)
         }
       }
   }

   return result;
}

function getGamesAgreedToPlayIds(playerId, view) {
  var result = [];

  for (var k in view) {
       if (view.hasOwnProperty(k)) {
         var gameInfo = view[k];
         if ((gameInfo[INVITEE_FIELD] === playerId || gameInfo[INVITER_FIELD] === playerId)
              && gameInfo[STATUS_FIELD] === STATUS_STARTED) {

            result.push(k)
         }
       }
   }

   return result;
}

function getObservableGames(playerId, view) {
  var result = [];

  for (var k in view) {

       if (view.hasOwnProperty(k)) {
         var gameInfo = view[k];
         if ( (gameInfo[INVITEE_FIELD] !== playerId) &&
            (gameInfo[INVITER_FIELD] !== playerId) &&
            (gameInfo[STATUS_FIELD] === STATUS_STARTED)) {

            // If either of these were null then one or more players aren't
            // visible to the player, so we don't return it as an observable
            // game
            if (gameInfo[INVITER_FIELD] && gameInfo[INVITEE_FIELD]) {
                result.push(k)
            }
         }
       }
   }

   return result;
}

function getGamesFinishedPageCb(playerId, start, end, view) {
  return [];
}

function getInviteSummary(gameId, gameInfo) {
  var invite = {
   gameId: gameId,
   sentBy: gameInfo[INVITER_FIELD],
   inviting: gameInfo[INVITEE_FIELD],
   inviterPlayingAs: gameInfo[INVITER_COLOUR_FIELD],
   timestamp: gameInfo[UPDATED_FIELD]
  }

  return invite;
}

function flumeReduceFunction(index, item) {
  if (!index) index = {};

  var type = item.value.content.type;

  if (type === "chess_invite") {
    handleInviteMsg(index, item);
  } else if (type === "chess_invite_accept") {
    handleAcceptInviteMsg(index, item);
  } else if (type === "chess_game_end") {
    handleEndGameMsg(index, item);
  }

  return index;
}

function flumeMapFunction(msg) {

  if (msg.value.content && isChessTypeMessage(msg.value.content)) {
    return msg;
  }
}

function handleInviteMsg(index, item) {
  var gameId = item.key;
  var inviter = item.value.author;
  var inviting = item.value.content.inviting;
  var inviterColor = item.value.content.myColor;

  if (index[gameId]) {
    var gameStatus = index[gameId];

    gameStatus[INVITER_FIELD] = inviter;
    gameStatus[INVITEE_FIELD] = inviting;
    gameStatus[INVITER_COLOUR_FIELD] = inviterColor;
  } else {
    var gameStatus = {}
    gameStatus[INVITER_FIELD] = inviter;
    gameStatus[INVITEE_FIELD] = inviting;
    gameStatus[INVITER_COLOUR_FIELD] = inviterColor;

    gameStatus[STATUS_FIELD] = STATUS_INVITED;
    gameStatus[UPDATED_FIELD] = Date.now() / 1000;

    index[gameId] = gameStatus;
  }
}

function handleAcceptInviteMsg(index, item) {
  var gameIdAccepted = item.value.content.root;
  var gameStatus = index[gameIdAccepted];

  if (gameStatus) {
    gameStatus[UPDATED_FIELD] = Date.now() / 1000;

    if (gameStatus[STATUS_FIELD] === STATUS_INVITED) {
      gameStatus[STATUS_FIELD] = STATUS_STARTED;
    }

  } else {
    gameStatus = {}
    gameStatus[STATUS_FIELD] = STATUS_STARTED;
    index[gameIdAccepted] = gameStatus;
  }
}

function handleEndGameMsg(index, item) {
  var gameIdAccepted = item.value.content.root;
  var gameStatus = index[gameIdAccepted];

  if (!gameStatus) {
    index[gameIdAccepted] = {};
    gameStatus = index[gameIdAccepted];
  }

  gameStatus[STATUS_FIELD] = item.value.content.status;

  var players = [gameStatus[INVITER_FIELD], gameStatus[INVITEE_FIELD]];
  gameStatus[WINNER_FIELD] = winnerFromEndMsg(players, item);
  gameStatus[UPDATED_FIELD] = Date.now() / 1000;
}

function winnerFromEndMsg(players, maybeGameEndMsg) {
  if (!maybeGameEndMsg || !players) {
    return null;
  } else {
    switch(maybeGameEndMsg.value.content.status) {
      case "mate":
        return maybeGameEndMsg.value.author;
      case "draw":
        return null;
      case "resigned":
        var winner = players.filter(playerId => playerId != maybeGameEndMsg.value.author)[0];
        return winner;
      default:
        return null;
    }
  }
}

function isChessTypeMessage(content) {
  return chessTypeMessages.find(type => content.type === type) != undefined
}
