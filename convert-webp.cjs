const sharp = require('sharp')
const path  = require('path')

const INPUT  = path.join(__dirname, 'public/bosses/48740.webp')
const OUTPUT = path.join(__dirname, 'public/bosses/48740-converted.png')

sharp(INPUT).png().toFile(OUTPUT)
  .then(() => console.log('Converted to', OUTPUT))
  .catch(console.error)
