
var createSbot = require('scuttlebot').use(require("./index"))
var ssbKeys = require('ssb-keys')
var pull = require('pull-stream');

var config = {port:9999,     friends: {
      dunbar: 150,
      hops: 2 // down from 3
    }};
config.keys = ssbKeys.loadOrCreateSync('/home/happy0/.ssb/secret');

var test_config = require('ssb-config/inject')('ssb', config)

var sbot = createSbot(test_config);

sbot.ssbChessIndex.getGamesAgreedToPlayIds("@RJ09Kfs3neEZPrbpbWVDxkN92x9moe3aPusOMOc4S2I=.ed25519", (err, res) => {

  if (err) {
    console.dir(err)
  } else {
    console.dir(res)
  }

});
