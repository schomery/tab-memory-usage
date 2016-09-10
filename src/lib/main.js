'use strict';

var tabUtils  = require('sdk/tabs/utils');
var tabs      = require('sdk/tabs');
var unload    = require('sdk/system/unload');
var timers    = require('sdk/timers');
var sp        = require('sdk/simple-prefs');
var prefs     = sp.prefs;
var self      = require('sdk/self');
var data      = self.data;
var tabs      = require('sdk/tabs');
var pageMod   = require('sdk/page-mod');
var windows   = require('sdk/windows').browserWindows;
var buttons   = require('sdk/ui/button/action');
var {Cu}      = require('chrome');
var {viewFor} = require('sdk/view/core');
var {getNodeView} = require('sdk/view/core');

var {DownloadUtils} = Cu.import('resource://gre/modules/DownloadUtils.jsm');
var {Services} = Cu.import('resource://gre/modules/Services.jsm');
var {CustomizableUI} = Cu.import('resource:///modules/CustomizableUI.jsm');

var userstyles = require('./userstyles');
userstyles.load(self.data.url('toolbar.css'));

var methods = {
  inside: (function () {
    function title (value) {
      return value
        .replace(/^[\d\.\,]+.{1,2}\ [\:\-\|]\ /, '')
        .replace(/\ [\:\-\|]\ [\d\.\,]+.{1,2}$/, '');
    }
    return {
      update: function (tab, value, aValue) {
        if (aValue >= sp.prefs.ignore * 1024 * 1024) {
          var delimiter = [':', '-', '|'][prefs.delimiter];
          tab.title = prefs.position === 0 ?
            (value + ' ' + delimiter + ' ' + title(tab.title)) :
            (title(tab.title) + ' ' + delimiter + ' ' + value);
        }
        else {
          tab.title = title(tab.title);
        }
      },
      remove: function (tab) {
        tab.title = title(tab.title);
      }
    };
  })(),
  outside: {
    update: function (tab, value, aValue) {
      tab = viewFor(tab);
      let document = tab.ownerDocument;
      let label = document.getAnonymousElementByAttribute(tab, 'anonid', 'tab-memory');
      if (!label) {
        let close = document.getAnonymousElementByAttribute(tab, 'anonid', 'close-button');
        if (close) {
          label = document.createElement('label');
          label.setAttribute('anonid', 'tab-memory');
          label.setAttribute('class', 'tab-text');
          label.setAttribute('crop', 'end');
          label.setAttribute('tooltiptext', 'ssend');
          close.parentNode.insertBefore(label, close);
        }
      }
      if (label) {
        label.setAttribute('value', aValue >= sp.prefs.ignore * 1024 * 1024 ? value : '');
      }
    },
    remove: function (tab) {
      tab = viewFor(tab);
      let document = tab.ownerDocument;
      let label = document.getAnonymousElementByAttribute(tab, 'anonid', 'tab-memory');
      if (label) {
        label.parentNode.removeChild(label);
      }
    }
  },
  toolbar: (function () {
    let button;
    let vcache = new WeakMap();
    let acache = new WeakMap();
    tabs.on('activate', function (tab) {
      if (prefs.mode === 2 || prefs.mode === 3) {
        methods.toolbar.update(tab, vcache.get(tab), acache.get(tab));
      }
    });
    function create () {
      button = buttons.ActionButton({
        id: 'tab-memory',
        label: 'Tab Memory Usage',
        badgeColor: '#4d4d4d',
        icon: {
          '16': './icons/16.png',
          '32': './icons/32.png',
          '64': './icons/64.png'
        },
        onClick: function () {
          Services.wm.getMostRecentWindow('navigator:browser')
            .BrowserOpenAddonsMgr('addons://detail/jid1-fRvgLzKONCsPew@jetpack/preferences');
        }
      });
    }
    function rgb (val) {
      let p = val / (50 * 1024 * 1024);
      p = Math.min(p, 1);
      function cutHex(h) {
        return (h.charAt(0) === '#') ? h.substring(1, 7) : h;
      }
      function hexToR(h) {return parseInt((cutHex(h)).substring(0, 2), 16);}
      function hexToG(h) {return parseInt((cutHex(h)).substring(2, 4), 16);}
      function hexToB(h) {return parseInt((cutHex(h)).substring(4, 6), 16);}

      let r1 = hexToR(prefs.end);
      let r2 = hexToR(prefs.begin);
      let r = Math.round((r1 * p) + (r2 * (1 - p)));
      let g1 = hexToG(prefs.end);
      let g2 = hexToG(prefs.begin);
      let g = Math.round((g1 * p) + (g2 * (1 - p)));
      let b1 = hexToB(prefs.end);
      let b2 = hexToB(prefs.begin);
      let b = Math.round((b1 * p) + (b2 * (1 - p)));
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    }
    return {
      update: function (tab, value, aValue) {
        if (value) {
          vcache.set(tab, value);
          acache.set(tab, aValue);
        }
        else {
          value = '';
          aValue = 0;
        }
        if (tab !== tab.window.tabs.activeTab) {
          return;
        }
        if (!button) {
          create();
        }
        let color = rgb(aValue);
        let show = aValue >= sp.prefs.ignore * 1024 * 1024;
        button.state(tab.window, {
          label: prefs.mode === 2 ? value || '--' : `Tab Memory Usage - ${value || 0}`,
          badge: show ? value.replace(/\.\d+/, '') : '',
          badgeColor: color
        });
        let node = getNodeView(button);
        if (node) {
          if (prefs.mode === 2 && show) {
            node.removeAttribute('badge');
            node.classList.remove('badged-button');
            node.setAttribute('show-label', 'true');
            node.setAttribute('style', `color: ${color};`);
          }
          else {
            node.removeAttribute('show-label');
          }
        }
      },
      remove: function () {
        if (button) {
          button.destroy();
        }
        button = null;
      }
    };
  })()
};

function exception (value) {
  if (prefs.exceptions) {
    return prefs.exceptions.split(/\s*\,\s*/).filter(e => e).filter(e => value.indexOf(e) !== -1).length !== 0;
  }
  if (prefs.includes) {
    return prefs.includes.split(/\s*\,\s*/).filter(e => e).filter(e => value.indexOf(e) !== -1).length === 0;
  }

  return false;
}

function update (id, value, aValue) {
  for (let tab of tabs) {
    if (tab.id === id && !exception(tab.url)) {
      methods[['inside', 'outside', 'toolbar', 'toolbar'][prefs.mode]].update(tab, value, aValue);
    }
  }
}

var report = (function () {
  function listen (e) {
    let arr = DownloadUtils.convertByteUnits(e.data.value);
    arr[1] = arr[1][0];
    var value = arr.join('');
    update(e.data.id, value, e.data.value);
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
      let mm = tabUtils.getBrowserForTab(viewFor(tab)).messageManager;
      mm.removeMessageListener('report', listen);
      mm.sendAsyncMessage('detach');
    }
    for (let window of windows) {
      let mm = viewFor(window).messageManager;
      mm.removeMessageListener('report', listen);
    }
  });
  return function (tab) {
      timers.setTimeout(function () {
        if (typeof tab !== 'undefined' && tab) {
          let mm = tabUtils.getBrowserForTab(viewFor(tab));
          if (mm) {
            mm.messageManager.sendAsyncMessage('report');
          }
        }
      }, 500);
  };
})();

var refresh = (function () {
  var times = {}, ids = {};

  return function (tab, forced) {
    var delay = prefs.delay * 1000;
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
    catch (e) {}
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

function removeAll () {
  for (let tab of tabs) {
    methods.inside.remove(tab);
    methods.outside.remove(tab);
    methods.toolbar.remove(tab);
  }
}
function refreshAll (forced) {
  for (let tab of tabs) {
    refresh(tab, forced);
  }
}
refreshAll();

sp.on('mode', function () {
  removeAll();
  refreshAll(true);
});
sp.on('position', refreshAll);
sp.on('delimiter', refreshAll);
sp.on('delay', function () {
  if (prefs.delay < 3) {
    prefs.delay = 3;
  }
});

unload.when(removeAll);

// welcome
if (self.loadReason === 'install' || self.loadReason === 'startup') {
  (function () {
    if (!prefs.welcome) {
      return;
    }
    let version = prefs.version;
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
}
