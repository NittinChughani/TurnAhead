'use strict';
const QRCode = require('./qr');
const QRLevel = require('./qr/QRErrorCorrectLevel');

function qrSvg(value) {
  const qr = new QRCode(0, QRLevel.M);
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const quiet = 4;
  let paths = [];
  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      if (qr.isDark(y, x)) paths.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Scan to track your queue ticket" viewBox="0 0 ${count + quiet * 2} ${count + quiet * 2}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${paths.join('')}" fill="#122143"/></svg>`;
}
module.exports = { qrSvg };