"use strict"

var Q = require('q');
var fs = require('fs-extra');
var path = require('path');
var sharp = require('sharp');
var ffmpeg = require('fluent-ffmpeg');

var mp4jsRegexp = /^(?!\.).+(m4a|mp4|mpe?g|mov)$/i;

var replaceExt = function(filePath, newExt) {
  var fileInfo = path.parse(filePath);
  fileInfo.ext = newExt;
  fileInfo.base = fileInfo.name + '.' + fileInfo.ext;
  return path.format(fileInfo);
};

var getImageFileName = function(fileName) {
  return mp4jsRegexp.test(path.basename(fileName)) ? replaceExt(fileName, 'jpg') : fileName;
};

module.exports = {
  generateThumbnail : function(sourceFileName, outputFileName, width, height, isMaxSize) {
    var deffered = Q.defer();
    fs.mkdirs(path.dirname(outputFileName), function(error) {
      if (error) {
          deffered.reject('mkdirs:'+error);
          return;
        }

      if(mp4jsRegexp.test(path.basename(sourceFileName))) {
        outputFileName = getImageFileName(outputFileName);

        // TODO: This should be handled by the image resize, the ffmpeg lib
        // should only extract the frames from the video
        width = width === undefined ? '?' : width;
        height = height === undefined || isMaxSize ? '?' : height;

        var size =''+width+'x'+height;
        // This operation is really heavy even on my mac book,
        // I think we should generate a single screenshot first
        // and then create a gif/png thumbnail with multiple images
        try {
          ffmpeg(sourceFileName)
            .screenshots({
              timestamps: ['50%'],
              filename: path.basename(outputFileName),
              folder: path.dirname(outputFileName),
              size: size
            });
            deffered.resolve();
        } catch(err) {
          console.log('catched', err);
          deffered.reject(sourceFileName + ':' + err);
        }
      } else {
        var image = sharp(sourceFileName);

        var handleImageResize = function(width, height) {
          image.rotate()
            .resize(width, height)
            .toFile(outputFileName, function(err) {
              if(err) {
                deffered.reject('sharp: ' +err);
              }
              deffered.resolve();
            });
        };

        if(isMaxSize) {
          image
            .metadata()
            .then(function(metadata) {
              var imgAspect = metadata.width / metadata.height;
              if(imgAspect > 1) {
                // Image is wider
                height = undefined;
              } else {
                width = undefined;
              }

              handleImageResize(width, height);
            });
        } else {
          handleImageResize(width, height);
        }
      }
    });
    return deffered.promise;
  },
  thumbnailNeedsUpdate : function thumbnailNeedsUpdate(sourceFileName, destFileName) {
  	var destSync;
    try {
  	   destSync = fs.statSync(getImageFileName(destFileName));
  	} catch(error) {
  		// ignore
  //		console.log('statSync',error);
  	}
  	if(destSync === undefined) {
  		return true;
  	}
  	var sourceSync = fs.statSync(sourceFileName);
  	var destFileEdited = new Date(destSync.mtime);
  	var srcFileEdited = new Date(sourceSync.mtime);
  	//console.log(destFileEdited.getTime(),' < ', srcFileEdited.getTime());
  	return destFileEdited.getTime() < srcFileEdited.getTime();
  }
};
