var fs = require('fs');
var gulp = require('gulp');
var gutil = require('gulp-util');
var coffee = require('gulp-coffee');
var stripDebug = require('gulp-strip-debug');
var mergeStream = require('merge-stream');
var mergeJSON = require('gulp-merge-json');
var zip = require('gulp-zip');
var jeditor = require("gulp-json-editor");
var rename = require('gulp-rename')

// Settings for building packages
var settings = {
    name: 'codesy',
    version: '0.0.0.5',
    source: './src',
    destination: './build',
    static_files: {
        source: './static',
        glob: ['css/*', 'js/*.js', 'img/*.png']
    },
    dev_server: {
        domain: '127.0.0.1',
        port: '8443'
    },
    firefox: {
        source: './src/firefox',
        destination: 'firefox',
        extension: '.xpi'
    },
    chrome: {
        source: './src/chrome',
        destination: 'chrome',
        extension: '.zip'

    }
}

// The following functions return a function to be used as a gulp task or to get
// a stream of files.  They take an options object that contains:
//    source: path of directory with files to work on
//    destination: (optional) path where files will go.  If destination is not included,
//                  the functions will return a stream of files.

compile_coffee = function(options) {
    this.source = options.source
    this.destination = options.destination
    return (
        function(_this) {
            return function() {
                console.log("compile "+_this.source + "/*.coffee files")
            // next line compile coffee files in source directory and ./src root
                var compiled_stream = gulp.src([_this.source + '/*.coffee', settings.source +'/*.coffee'])
                                            .pipe(coffee({bare: true}).on('error', gutil.log))
                if (_this.destination){
                    return compiled_stream.pipe(gulp.dest(_this.destination + '/js'))
                } else {
                    return compiled_stream
                }
            }
        }
    )(this)
}

static_files = function(destination) {
  this.destination = destination
  return (
    function(_this) {
      return function() {
        var static_stream = gulp.src(settings.static_files.glob,
                                      { base: settings.static_files.source,
                                        cwd: settings.static_files.source
                                      })
        if (_this.destination){
          return static_stream.pipe(gulp.dest( _this.destination ))
        } else {
          return static_stream
        }
      }
    }
  )(this)
}

// this function needs to include dev server details in the options object:
//    dev_server: object with domain and port

var manifest = function (options){
  this.options = options
  return (
    function(_this) {
        return function() {
            var common = gulp.src(settings.source + '/manifest.json')
            var additions = gulp.src(_this.options.source+'/manifest_additions.json')
            manifest_stream = mergeStream(additions, common)
            .pipe(mergeJSON('manifest.json'))
            .pipe(jeditor(function(json) {
                json.version=settings.version
                return json
            }))
            if (_this.destination){
                return manifest_stream.pipe(gulp.dest(_this.destination));
            } else {
                return manifest_stream
            }
        }
    })(this)
}

var add_dev_server = function (manifest_stream) {
    var warning = ['THIS IS NOT the production manifest.'],
    dev_permission =["https://",settings.dev_server.domain,":",settings.dev_server.port,"/"],
    dev_match =["https://",settings.dev_server.domain,"/"]
    return manifest_stream
        .pipe(jeditor(function(json) {
            json.DEV_WARNING=warning.join("")
            json.permissions.push(dev_permission.join(""))
            json.content_scripts[1].matches.push(dev_match.join(""))
            return json
        }))
}

var package = function (options, zipped, for_dev){
    this.options = options
    this.zipped = zipped
    this.for_dev = for_dev
    return (
        function(_this) {
            return function() {
                var package_name, destination, package_stream
                var static_stream = (new static_files())()
                var manifest_stream = (new manifest({source:_this.options.source}))()
                var js_stream = (new compile_coffee({source:_this.options.source}))()
                    .pipe(rename(function (path) {
                        path.dirname += "/js";
                    }))

                if (_this.for_dev){
                    manifest_stream = add_dev_server (manifest_stream)
                    package_name = settings.name + '-dev' + _this.options.extension
                    destination = _this.options.destination

                } else {
                    js_stream.pipe(stripDebug())
                    package_name = settings.name + '-' + settings.version + _this.options.extension
                    destination = settings.destination
                }

                package_stream = mergeStream (manifest_stream,js_stream,static_stream)

                if (_this.zipped) {
                    package_stream
                        .pipe(zip(package_name))
                        .pipe(gulp.dest(destination))
                } else {
                    package_stream
                        .pipe(gulp.dest(destination));
                }
            }
        }
    )(this)
}

var watch_dev = function (options, task) {
    console.log("start watching");
    var manifest_files = [settings.source + '/manifest.json',options.source + '/manifest_additions.json']
    var coffee_files = [options.source + '/*.coffee', settings.source + '/*.coffee']
    // watch static files
    gulp.watch(settings.static_files.source + '/**', task)
    // watch manifest files
    gulp.watch(manifest_files, task)
    gulp.watch(coffee_files, task)
}

// DEV TASKS

gulp.task('dev-chrome-unpacked', ['chrome-unpacked'], function() {
    watch_dev(settings.chrome,['chrome-unpacked'])
})

gulp.task('dev-chrome-packed', ['chrome-dev-zip'], function() {
    watch_dev(settings.chrome,['chrome-dev-zip'])
})

gulp.task('dev-firefox-unpacked', ['firefox-unpacked'], function() {
    watch_dev(settings.chrome,['firefox-unpacked'])
})

gulp.task('dev-firefox-packed', ['firefox-dev-xpi'], function() {
    watch_dev(settings.chrome,['firefox-dev-xpi'])
})

gulp.task('dev-unpacked',['dev-chrome-unpacked','dev-firefox-unpacked'])
gulp.task('dev-packed',['dev-chrome-packed','dev-firefox-packed'])



// FILE BUILDING TASKS

// create xpi for FF dev in the firefox.source directory with dev settings
gulp.task('firefox-dev-xpi', (new package(settings.firefox, true, true)))

// create firefox dev directroy in the firefox.source directory with dev settings
gulp.task('firefox-unpacked', (new package(settings.firefox, false, true)))

// create zip for chrome dev in the chrome.source directory with dev settings
gulp.task('chrome-dev-zip', (new package(settings.chrome, true, true)))

// create chrome dev directroy in the chrome.source directory with dev settings
gulp.task('chrome-unpacked', (new package(settings.chrome, false, true)))


// create xpi for FF prod
gulp.task('publish-firefox', (new package(settings.firefox, true, false)))

// create zip for chrome
gulp.task('publish-chrome', (new package(settings.chrome, true, false)))

gulp.task('publish-all',['publish-firefox','publish-chrome'])
