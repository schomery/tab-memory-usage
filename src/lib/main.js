'use strict';

var {Cc, Ci, Cu} = require('chrome');
var tabUtils = require('sdk/tabs/utils');
var {viewFor} = require('sdk/view/core');
var tabs = require('sdk/tabs');
var unload = require('sdk/system/unload');
var timers = require('sdk/timers');

var {DownloadUtils} = Cu.import('resource://gre/modules/DownloadUtils.jsm');

function update (tab, value) {
  tab = viewFor(tab);
  var document = tab.ownerDocument;
  var label = document.getAnonymousElementByAttribute(tab, 'anonid', 'tab-memory');
  if (!label) {
    var title = document.getAnonymousElementByAttribute(tab, 'anonid', 'tab-label');
    if (title) {
      var hbox = document.createElement('hbox');
      label = document.createElement('label');
      label.setAttribute('anonid', 'tab-memory');
      label.setAttribute('style', 'margin-left: 0; margin-right: 1px; text-decoration: underline; text-decoration-style: dashed;');
      hbox.appendChild(label);
      title.parentNode.insertBefore(hbox, title);
    }
  }
  label.setAttribute('value', value);
}

function remove (tab) {
  tab = viewFor(tab);
  var document = tab.ownerDocument;
  var label = document.getAnonymousElementByAttribute(tab, 'anonid', 'tab-memory');
  if (label) {
    var stack = label.parentNode;
    stack.parentNode.removeChild(stack);
  }
}

var refresh = (function () {
  var delay = 3000, times = {}, ids = {};
  var mgr = Cc['@mozilla.org/memory-reporter-manager;1']
    .getService(Ci.nsIMemoryReporterManager);

  return function (tab, forced) {
    var time = times[tab.id];
    var id = ids[tab.id];

    if (id && !forced) {
      return;
    }
    if (forced) {
      ids[tab.id] = null;
    }
    var now = new Date().getTime();
    if (time && now - time < delay) {
      ids[tab.id] = timers.setTimeout(refresh, delay - (now - time), tab, true);
      return;
    }
    //console.error((new Date()).toString(), 'refreshing ...', tab.id);

    times[tab.id] = now;

    var jsObjectsSize = {}, jsStringsSize = {}, jsOtherSize = {}, domSize = {}, styleSize = {},
      otherSize = {}, totalSize = {}, jsMilliseconds = {}, nonJSMilliseconds = {};
    var contentWindow = tabUtils.getTabContentWindow(viewFor(tab));
    mgr.sizeOfTab(contentWindow, jsObjectsSize, jsStringsSize, jsOtherSize,
      domSize, styleSize, otherSize, totalSize,
      jsMilliseconds, nonJSMilliseconds);

    update(
      tab,
      DownloadUtils.convertByteUnits(totalSize.value).join('').replace('MB', 'M').replace('KB', 'K')
    );
  };
})();

tabs.on('ready', refresh);
tabs.on('load', refresh);
for (let tab of tabs) {
  refresh(tab);
}

unload.when(function () {
  for (let tab of tabs) {
    remove(tab);
  }
});
