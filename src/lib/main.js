'use strict';

var {Cu} = require('chrome');
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
var windows = require('sdk/windows').browserWindows;

var {DownloadUtils} = Cu.import('resource://gre/modules/DownloadUtils.jsm');

var report = (function () {
  function listen (e) {
    var value = DownloadUtils.convertByteUnits(e.data.value).join('').replace('MB', 'M').replace('KB', 'K');
    update(e.data.id, value);
  }
  function attach (window) {
    var mm = viewFor(window).messageManager;
    mm.loadFrameScript(data.url('chrome.js'), true);
    mm.addMessageListener('report', listen);
  }

  for (let window of windows) {
    attach(window);
  }
  windows.on('open', function (window) {
    attach(window);
  });
  tabs.on('ready', function (tab) {
    var mm = tabUtils.getBrowserForTab(viewFor(tab)).messageManager;
    mm.sendAsyncMessage('id', tab.id);
  });
  tabs.on('open', function (tab) {
    var mm = tabUtils.getBrowserForTab(viewFor(tab)).messageManager;
    mm.sendAsyncMessage('id', tab.id);
  });
  for (let tab of tabs) {
    var mm = tabUtils.getBrowserForTab(viewFor(tab)).messageManager;
    mm.sendAsyncMessage('id', tab.id);
  }

  unload.when(function () {
    for (let tab of tabs) {
      var mm = tabUtils.getBrowserForTab(viewFor(tab)).messageManager;
      mm.removeMessageListener('report', listen);
      mm.sendAsyncMessage('detach');
    }
    for (let window of windows) {
      var mm = viewFor(window).messageManager;
      mm.removeMessageListener('report', listen);
    }
  });
  return function (tab) {
    if (typeof tab !== 'undefined' && tab) {
      timers.setTimeout(function () {
        var mm = tabUtils.getBrowserForTab(viewFor(tab));
        if (mm) {
          mm.messageManager.sendAsyncMessage('report');
        }
      }, 500);
    }
  };
})();

// welcome
(function () {
  if (!prefs.welcome) {
    return;
  }
  var version = prefs.version;
  if (self.version !== version) {
    timers.setTimeout(function () {
      let url = 'http://mybrowseraddon.com/tab-memory.html?v=' + self.version;
      if (version && version !== 'undefined') {
        tabs.open({url: url + '&p=' + version + '&type=upgrade', inBackground: true});
      }
      else {
        tabs.open(url + '&type=install');
      }
      prefs.version = self.version;
    }, 3000);
  }
})();

function title (value) {
  return value
    .replace(/^[\d\.\,]+.{1,2}\ [\:\-\|]\ /, '')
    .replace(/\ [\:\-\|]\ [\d\.\,]+.{1,2}$/, '');
}
function exception (value) {
  return (prefs.exceptions || '').split(/\s*\,\s*/).filter(e => e).filter(e => value.indexOf(e) !== -1).length !== 0;
}
function update (id, value) {
  var delimiter = [':', '-', '|'][prefs.delimiter];

  for (let tab of tabs) {
    if (tab.id === id && !exception(tab.url)) {
      tab.title = prefs.position === 0 ?
        (value + ' ' + delimiter + ' ' + title(tab.title)) :
        (title(tab.title) + ' ' + delimiter + ' ' + value);
    }
  }
}

function remove (tab) {
  tab.title = title(tab.title);
}

var refresh = (function () {
  var delay = 3000, times = {}, ids = {};

  return function (tab, forced) {
    try {
      if (typeof tab === 'undefined' || typeof tab === undefined || !tab || !tab.id) {
        return;
      }
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
      report(tab);
    }
    catch (e) {};
  };
})();

tabs.on('ready', refresh);
tabs.on('open', refresh);
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

function refreshAll() {
  for (let tab of tabs) {
    refresh(tab);
  }
}
refreshAll();

sp.on('position', refreshAll);
sp.on('delimiter', refreshAll);

unload.when(function () {
  for (let tab of tabs) {
    remove(tab);
  }
});
