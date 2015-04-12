/* globals self */
'use strict';

// although mutation calls are too many however, the extension prevents to run the update module more than once per 3 seconds
var observer = new MutationObserver(function () {
  self.port.emit('update');
});

observer.observe(document, {
  childList: true,
  subtree: true,
  attributes: true,
  characterData: true,
  attributeOldValue: true,
  characterDataOldValue: true
});

self.port.on('detach', function () {
  observer.disconnect();
});
