const pull = require ('pull-stream');
const pullScan = require('pull-scan');

/**
 * When a new value is emitted from the given pull stream source, if it
 * is different from the last value emitted it will be emitted by this 'through',
 * otherwise it will be filtered from the stream

 * @comparerFn (a, b) => Bool . A function that can compare two values and
                         returns true if they indicate changes have been made
                         and false otherwise.
 * @return A new pull-stream source.
 */
function pullFilterOnlyIfChangeFromPrevious(source, comparerFn) {

  var scanFn = (acc, next) => {
    return [acc, next];
  }

  var filterFn = (pair) => comparerFn(pair[0], pair[1]);

  // Return the 'next' value
  var mapFn = (pair) => pair[1]

  var ifChangesFilter = pull(pullScan(scanFn), pull.filter(filterFn));
  var emitOnlyIfChanged = map(ifChangesFilter, mapFn);

  return pull(source, emitOnlyIfChanged);
}

module.exports = pullFilterOnlyIfChangeFromPrevious;
