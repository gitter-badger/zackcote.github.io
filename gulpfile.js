var gulp          = require('gulp'),
    autoprefixer  = require('gulp-autoprefixer'),
    browserSync   = require('browser-sync'),
    concat        = require('gulp-concat'),
    imagemin      = require('gulp-imagemin'),
    jshint        = require('gulp-jshint'),
    minifycss     = require('gulp-minify-css'),
    notify        = require('gulp-notify'),
    open          = require("gulp-open"),
    plumber       = require('gulp-plumber'),
    rename        = require('gulp-rename'),
    size          = require('gulp-filesize'),
    stylus        = require('gulp-stylus'),
    uglify        = require('gulp-uglify');

//need a shell task that "jekyll build"s and then triggers browserSync.

//need to make css, imgs, and js trigger browsersync

gulp.task('style', function() {
  return gulp.src('src/styles/main.styl')
  .pipe(plumber())
  .pipe(stylus())
  .pipe(autoprefixer('last 2 version', 'safari 5', 'ie 8', 'ie 9', 'opera 12.1'))
  .pipe(rename({suffix: '.min'}))
  .pipe(minifycss())
  .pipe(gulp.dest('_site/assets/css/'))
  .pipe(gulp.dest('assets/css/'))
  .pipe(notify("styles minified."))
  .pipe(size());
});

gulp.task('scripts', function() {
  return gulp.src('src/scripts/**/*.js')
  .pipe(plumber())
  .pipe(jshint('.jshintrc'))
  .pipe(jshint.reporter('default'))
  .pipe(concat('main.js'))
  .pipe(rename({suffix: '.min'}))
  .pipe(uglify())
  .pipe(gulp.dest('assets/js'))
  .pipe(gulp.dest('_site/assets/js'))
  .pipe(notify("scripts done."))
  .pipe(size());
});

gulp.task('images', function() {
  return gulp.src('src/images/**/*')
  .pipe(plumber())
  .pipe(cache(imagemin({ optimizationLevel: 3, progressive: true, interlaced: true })))
  .pipe(gulp.dest('assets/img'))
  .pipe(gulp.dest('_site/assets/img'))
  .pipe(notify({ message: 'images done.' }))
});

gulp.task('watch', function() {
  gulp.watch('src/styles/**/*.styl', ['style']);
  gulp.watch('src/scripts/**/*.js', ['scripts']);
  gulp.watch('src/images/**/*.*', ['images']);
  gulp.watch([
      '*.html',
      '_includes/**/*.*',
      '_layouts/**/*.*',
      '_posts/**/*.*'],
    ['jekyll']
    );

});

gulp.task('sources', ['style','scripts','images']);

gulp.task('default', ['watch']);