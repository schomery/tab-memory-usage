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

function onload () {
  self.port.emit('update');
}

document.addEventListener('DOMContentLoaded', onload, false);

self.port.on('detach', function () {
  observer.disconnect();
  try {
    document.removeEventListener('DOMContentLoaded', onload, false);
  }
  catch (e) {}
});
