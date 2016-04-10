#External dependencies:

### Exiftool
Mac OS X:
sudo brew update
sudo brew install exiftool

Ubuntu:
sudo apt-get update
sudo apt-get install libimage-exiftool-perl libvips-dev build-essential libav-tools

curl -sL https://deb.nodesource.com/setup_4.x | sudo -E bash -
sudo apt-get install -y nodejs

libav-tools will install avprobe, need to create a symbolic link so it can be use by fluent-ffmpeg.
ln -s /usr/bin/avprobe /usr/bin/ffprobe
ln -s /usr/bin/avconv /usr/bin/ffmpeg


### libvips
### ffmpeg
