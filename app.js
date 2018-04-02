const express = require('express')
  , app = express()
  , imgproc = require('./imgproc')

// image fast loader
app.use(imgproc.loader());
app.use(express.static('resources'))

app.listen(3001);