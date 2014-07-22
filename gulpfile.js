var gulp          = require('gulp'),
autoprefixer  = require('gulp-autoprefixer'),
cache         = require('gulp-cache'),
clean         = require('gulp-clean'),
concat        = require('gulp-concat'),
webserver     = require('gulp-webserver'),
gutil         = require('gulp-util');
imagemin      = require('gulp-imagemin'),
jshint        = require('gulp-jshint'),
livereload    = require('gulp-livereload'),
minifycss     = require('gulp-minify-css'),
notify        = require('gulp-notify'),
open          = require("gulp-open"),
plumber       = require('gulp-plumber'),
rename        = require('gulp-rename'),
stylus        = require('gulp-stylus'),
uglify        = require('gulp-uglify'),
shell         = require('gulp-shell');

var onError = function (err) {  
  gutil.beep();
  console.log(err);
  return notify().write(err);
};

gulp.task('stylus', function() {
  return gulp.src('src/stylus/main.styl')
  .pipe(plumber(onError))
  .pipe(stylus())
  .pipe(autoprefixer('last 2 version', 'safari 5', 'ie 8', 'ie 9', 'opera 12.1', 'ios 6', 'android 4'))
  .pipe(rename({suffix: '.min'}))
  .pipe(minifycss())
  .pipe(gulp.dest('assets/css'))
  .pipe(gulp.dest('_site/assets/css'))
  .pipe(notify({ message: 'Stylus Compiled, Prefixed, and Minified!' }))
});

gulp.task('scripts', function() {
  return gulp.src('src/scripts/**/*.js')
  .pipe(plumber(onError))
  .pipe(jshint('.jshintrc'))
  .pipe(jshint.reporter('default'))
  .pipe(concat('main.js'))
  .pipe(gulp.dest('assets/js'))
  .pipe(rename({suffix: '.min'}))
  .pipe(uglify())
  .pipe(gulp.dest('assets/js'))
  .pipe(gulp.dest('_site/assets/js'))
  .pipe(notify({ message: 'Scripts Concatenated and Uglified!' }))
});

gulp.task('images', function() {
  return gulp.src('src/img/**/*')
  .pipe(plumber(onError))
  .pipe(cache(imagemin({ optimizationLevel: 5, progressive: true, interlaced: true })))
  .pipe(gulp.dest('assets/img'))
  .pipe(gulp.dest('_site/assets/img'))
  .pipe(notify({ message: 'Images Compressed!' }))
});

gulp.task('webserver', function() {
  gulp.src('_site')
    .pipe(webserver({
      livereload: true
    }));
});

gulp.task('open', ['jekyll'], function(){
  var options = {
    url: "http://localhost:8000",
    app: "chrome"
  };
  gulp.src("*.html")
  .pipe(open("", options));
});

gulp.task('jekyll', shell.task('jekyll build'));


gulp.task('watch', function() {

  gulp.watch('src/stylus/**/*.styl', ['stylus']);

  gulp.watch('src/scripts/**/*.js', ['scripts']);

  gulp.watch('src/img/**/*', ['images']);

  gulp.watch([
    '_includes/**/*.html',
    '_layouts/**/*.html',
    '_posts/**/*',
    'index.html'
    ], ['jekyll']);

});

//Default Task

gulp.task('default', ['webserver', 'open'], function() {
  gulp.start('stylus', 'scripts', 'images', 'watch');
});

