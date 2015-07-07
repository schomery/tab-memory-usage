/* globals content, sendAsyncMessage, addMessageListener, removeMessageListener */
'use strict';

var isACtive = true;
var id;

var mgr = Components.classes['@mozilla.org/memory-reporter-manager;1']
  .getService(Components.interfaces.nsIMemoryReporterManager);
var jsObjectsSize = {}, jsStringsSize = {}, jsOtherSize = {}, domSize = {}, styleSize = {},
  otherSize = {}, totalSize = {}, jsMilliseconds = {}, nonJSMilliseconds = {};

function report () {
  if (id) {
    mgr.sizeOfTab(content, jsObjectsSize, jsStringsSize, jsOtherSize,
      domSize, styleSize, otherSize, totalSize,
      jsMilliseconds, nonJSMilliseconds);

    sendAsyncMessage('report', {
      value: totalSize.value,
      id: id
    });
  }
}
function setID (e) {
  id = e.data;
}
function detach () {
  isACtive = false;
  removeMessageListener('report', report);
  removeMessageListener('id', setID);
  removeMessageListener('detach', detach);
}

addMessageListener('id', setID);
addMessageListener('report', report);
addMessageListener('detach', detach);
