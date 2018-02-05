"use strict";

var shIndex = require('stureby_index');
var path = require('path');
var fs = require('fs');
var Redis = require('redis');
var MediaMeta = require('../modules/media_meta.js');
var shFiles = require('../modules/shatabang_files');

/**
This task should run every time the task processor is restarted
**/
var init = function(config, task_queue) {
  var infoDirectory = path.join(config.cacheDir, 'info');
  var storageDir = config.storageDir;
  var versionKey = 'shatabangVersion';

  task_queue.registerTaskProcessor('upgrade_check', function(data, job, done) {
    var redis = Redis.createClient(task_queue.redisConnectionInfo);
    // Check version in redisStore
    redis.get(versionKey, function (err, version) {
      if(err) {
        console.log('Error while retrieving versionKey', err);
        return;
      }
      console.log('Index version', version);
      if(!version) {
        upgrade_v1(infoDirectory, storageDir, (error) => {
          if(error) {
            done(error);
            return;
          }
          // On succesful upgrade
          redis.set(versionKey, 1);
          console.log('Successfully upgraded index to', 'v1');
          done();
        });
        upgrade_faces_index(infoDirectory, config.cacheDir, task_queue);
        task_queue.queueTask('retry_unknown', {}, 'low');
      } else if(version < 2) {
        upgrade_faces_index(infoDirectory, config.cacheDir, task_queue);
        redis.set(versionKey, 2);
        task_queue.retryFailed();
      } else {
        done();
      }
    });
    redis.quit();
  });
};

function isNumber(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

var upgrade_v1 = function(infoDirectory, storageDir, cb) {
  shFiles.listSubDirs(infoDirectory, function(error, dirs) {
    if(error) {
      return cb(error);
    }
    // Add all images to the media index with user rating 0.5
    dirs.forEach((dir) => {
      if(!isNumber(dir)) {
        return;
      }
      var yearDir = path.join(infoDirectory, dir);
      var mediaLst = fs.readFileSync(path.join(yearDir, 'media.lst'), 'UTF-8').split(',');

      var mediaMeta = new MediaMeta(yearDir);
      mediaLst.forEach((itm) => {
        fs.stat(path.join(storageDir, itm), (err, stats) => {
          var fileSize = -1;
          if(err) {
            console.log('Upgrade check error', err);
            return;
          }
          fileSize = stats.size;
          mediaMeta.set(itm, {
            ur: 0.5,
            s: fileSize
          });
        });
      });
    });
    cb();
  });
};

/** Re run all face recognitions so we add the cropped information to the index **/
function upgrade_faces_index(infoDirectory, cache_dir, task_queue) {
  var idx = shIndex(path.join(cache_dir, 'idx_faces'));
  idx.clear();

  allMedia(infoDirectory, function(items) {
    items.forEach((relativeDest) => {
      task_queue.queueTask('faces_find', { title: relativeDest, file: relativeDest}, 'low');
    });
  });
}

/** Function which returns all media files ordered in a single array with all items. */
function allMedia(infoDirectory, cb) {
  shFiles.listSubDirs(infoDirectory, function(error, dirs) {
    if(error) {
      return cb(error);
    }
    var result = [];
    // Add all images to the media index with user rating 0.5
    dirs.forEach((dir) => {
      if(!isNumber(dir)) {
        return;
      }
      var yearDir = path.join(infoDirectory, dir);
      var mediaLst = fs.readFileSync(path.join(yearDir, 'media.lst'), 'UTF-8').split(',');
      mediaLst.forEach((itm) => {
        result.push(itm);
      });
    });
    cb(result);
  });
}

module.exports = {
  init : init
};
