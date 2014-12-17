"use strict";
var gulp         = require('gulp');
var cp           = require('child_process');
var stylus       = require('gulp-stylus');
var autoprefixer = require('gulp-autoprefixer');
var plumber      = require('gulp-plumber');
var jeet         = require('jeet');
var rupture      = require('rupture');
var csso         = require('gulp-csso');
var rename       = require("gulp-rename");
var browserSync  = require('browser-sync');
var reload       = browserSync.reload;
var del          = require('del');
var size         = require('gulp-filesize');
var imagemin     = require('gulp-imagemin');
var pngcrush     = require('imagemin-pngcrush');
var concat       = require('gulp-concat');
var uglify       = require('gulp-uglify');
var srcPath = {
    styles: 'src/stylus/**/*.styl',
    images: 'src/images/*'
};
var destPath = {
    images: 'assets/images'
};
var messages = {
    jekyllBuild: 'Running: $ jekyll build'
};


//change cp.exec to cp.spawn if on windows
gulp.task('jekyll-build', function (done) {
    browserSync.notify(messages.jekyllBuild);
    return cp.spawn('jekyll.bat', ['build'], {stdio: 'inherit'}).on('close', done);
});

gulp.task('jekyll-rebuild', ['jekyll-build'], function () {
    browserSync.reload();
});

gulp.task('bs-reload', function () {
    browserSync.reload();
});

gulp.task('browser-sync', function () {
    browserSync({
        server: {
            baseDir: "_site/"
        },
        open: "external",
    });
});

gulp.task('asset-clean', function(cb) {
  // You can use multiple globbing patterns as you would with `gulp.src`
  del(['_site/assets/css/*', 'assets/css/*' ], cb);
});

gulp.task('images', function () {
    return gulp.src(srcPath.images)
        .pipe(imagemin({
            optimizationLevel: 7,
            progressive: true,
            svgoPlugins: [{removeViewBox: false}],
            use: [pngcrush()]
        }))
        .pipe(gulp.dest(destPath.images));
});

gulp.task('styles', ['asset-clean'], function () {
    gulp.src('src/stylus/main.styl')
        .pipe(plumber())
        .pipe(stylus({
            use: [
                jeet(),
                rupture()
            ]
        }))
        .pipe(autoprefixer())
        .pipe(gulp.dest('assets/css'))
        .pipe(csso())
        .pipe(rename("main.min.css"))
        .pipe(gulp.dest('assets/css'))
        .pipe(gulp.dest('_site/assets/css'))
        .pipe(size())
        .pipe(reload({stream: true}));
});

gulp.task('js', function () {
    return gulp.src('src/js/main.js')
        .pipe(uglify())
        .pipe(gulp.dest('assets/js/'))
        .pipe(gulp.dest('_site/assets/js/'));
});

gulp.task('watch', function () {
    gulp.watch(srcPath.styles, ['styles']);
    gulp.watch(srcPath.images, ['images']);
    gulp.watch('src/js/main.js', ['js', 'bs-reload']);
    gulp.watch(['*.html', '*.md', '_layouts/*.html', '_posts/*', '_includes/*', '_drafts/*'], ['jekyll-rebuild']);
});

gulp.task('default', ['styles', 'images', 'jekyll-build', 'browser-sync', 'watch']);
