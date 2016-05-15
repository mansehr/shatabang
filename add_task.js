'use strict';

var path = require('path');
var ProgressBar = require('progress');
var shFiles =   require('./modules/shatabang_files');
var task_queue = require('./modules/task_queue');
var importer = require('./task_processors/importer');

var config = require('./config_server.json');

var argv = require('minimist')(process.argv.slice(2));

if (argv._.length < 1) {
  console.log('Must give action name as parameter');
  process.exit(1);
}

var bar;
var action;
var sourceDir = config.storageDir;

if(argv._[0] === 'create_image_finger') {
  action = function(elem) {
    task_queue.queueTask('create_image_finger', { title: elem, file: elem});
  };
  sourceDir = path.join(config.cacheDir, '1920');
} else if(argv._[0] === 'import') {
  sourceDir = path.join(config.storageDir, 'upload');
  action = function(elem) {
    return importer(path.join(sourceDir, elem), config.storageDir);
  };
}

console.log("Reading dir: " + sourceDir);

var main = function() {

  shFiles.listMediaFiles(sourceDir, function(error, filesList) {
    if (error) {
      if (error.code === 'ENOENT') {
        console.error('Error! Could not find the given source folder: ', sourceDir);
      } else {
        throw error;
      }
      process.exit(2);
    }

    console.log(filesList.length);
    bar = new ProgressBar('[:bar] :percent (:current/:total) :etas', { total: filesList.length });

    var relativeFilesList = filesList.map(function(item) {
      return path.relative(sourceDir, item);
    });

    relativeFilesList.forEach(function(elem) {
      return action(elem).then(function() {
        bar.tick();
      });
    });

    done();
  });
};

var done = function() {
  console.log("Disconnecting queue");
  task_queue.disconnect();
};


main();
