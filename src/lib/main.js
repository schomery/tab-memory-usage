'use strict';

var {Cc, Ci, Cu} = require('chrome');
var tabUtils = require('sdk/tabs/utils');
var {viewFor} = require('sdk/view/core');
var tabs = require('sdk/tabs');
var unload = require('sdk/system/unload');
var timers = require('sdk/timers');
var sp = require('sdk/simple-prefs');
var prefs = sp.prefs;
var self = require('sdk/self');
var data = self.data;
var tabs = require('sdk/tabs');
var pageMod = require('sdk/page-mod');

var {DownloadUtils} = Cu.import('resource://gre/modules/DownloadUtils.jsm');

// welcome
(function () {
  var version = prefs.version;
  if (self.version !== version) {
    timers.setTimeout(function () {
      tabs.open(
        'http://mybrowseraddon.com/tab-memory.html?v=' + self.version +
        (version && version !== 'undefined' ? '&p=' + version + '&type=upgrade' : '&type=install')
      );
      prefs.version = self.version;
    }, 3000);
  }
})();

function update (tab, value) {
  tab = viewFor(tab);
  var document = tab.ownerDocument;
  var label = document.getAnonymousElementByAttribute(tab, 'anonid', 'tab-memory');
  if (!label) {
    var title = document.getAnonymousElementByAttribute(tab, 'anonid', 'tab-label');
    var close = document.getAnonymousElementByAttribute(tab, 'anonid', 'close-button');
    if (title && close) {
      var hbox = document.createElement('hbox');
      label = document.createElement('label');
      label.setAttribute('anonid', 'tab-memory');
      label.setAttribute(
        'style',
        'margin: 0 1px; text-decoration: underline; text-decoration-style: dotted;'
      );
      hbox.appendChild(label);
      title.parentNode.insertBefore(hbox, close);
    }
  }
  label.setAttribute('value', value);
}

function remove (tab) {
  tab = viewFor(tab);
  var document = tab.ownerDocument;
  var label = document.getAnonymousElementByAttribute(tab, 'anonid', 'tab-memory');
  if (label) {
    var hbox = label.parentNode;
    hbox.parentNode.removeChild(hbox);
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
pageMod.PageMod({
  include: '*',
  attachTo: ['top', 'existing', 'frame'],
  contentScriptWhen: 'start',
  contentScriptFile: data.url('inject.js'),
  onAttach: function (worker) {
    worker.port.on('update', function () {
      refresh(worker.tab);
    });
  }
});
for (let tab of tabs) {
  refresh(tab);
}

unload.when(function () {
  for (let tab of tabs) {
    remove(tab);
  }
});
