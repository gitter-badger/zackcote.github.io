/**
 * smoothState.js is a jQuery plugin to stop page load jank.
 *
 * This jQuery plugin progressively enhances page loads to
 * behave more like a single-page application.
 *
 * @author  Miguel Ángel Pérez   reachme@miguel-perez.com
 * @see     https://github.com/miguel-perez/jquery.smoothState.js
 *
 */
;
(function($, window, document, undefined) {
    "use strict";

    var
    /** Used later to scroll page to the top */
        $body = $("html, body"),

        /** Used in development mode to console out useful warnings */
        consl = (window.console || false),

        /** Plugin default options */
        defaults = {

            /** jquery element string to specify which anchors smoothstate should bind to */
            anchors: "a",

            /** If set to true, smoothState will prefetch a link's contents on hover */
            prefetch: false,

            /** A selecor that deinfes with links should be ignored by smoothState */
            blacklist: ".no-smoothstate, [target]",

            /** If set to true, smoothState will log useful debug information instead of aborting */
            development: false,

            /** The number of pages smoothState will try to store in memory and not request again */
            pageCacheSize: 0,

            /** A function  that can be used to alter urls before they are used to request content */
            alterRequestUrl: function(url) {
                return url;
            },

            /** Run when a link has been activated */
            onStart: {
                duration: 0,
                render: function(url, $container) {
                    $body.scrollTop(0);
                }
            },

            /** Run if the page request is still pending and onStart has finished animating */
            onProgress: {
                duration: 0,
                render: function(url, $container) {
                    $body.css("cursor", "wait");
                    $body.find("a").css("cursor", "wait");
                }
            },

            /** Run when requested content is ready to be injected into the page  */
            onEnd: {
                duration: 0,
                render: function(url, $container, $content) {
                    $body.css("cursor", "auto");
                    $body.find("a").css("cursor", "auto");
                    $container.html($content);
                }
            },

            /** Run when content has been injected and all animations are complete  */
            callback: function(url, $container, $content) {

            }
        },

        /** Utility functions that are decoupled from SmoothState */
        utility = {

            /**
             * Checks to see if the url is external
             * @param   {string}    url - url being evaluated
             * @see     http://stackoverflow.com/questions/6238351/fastest-way-to-detect-external-urls
             *
             */
            isExternal: function(url) {
                var match = url.match(/^([^:\/?#]+:)?(?:\/\/([^\/?#]*))?([^?#]+)?(\?[^#]*)?(#.*)?/);
                if (typeof match[1] === "string" && match[1].length > 0 && match[1].toLowerCase() !== window.location.protocol) {
                    return true;
                }
                if (typeof match[2] === "string" && match[2].length > 0 && match[2].replace(new RegExp(":(" + {
                        "http:": 80,
                        "https:": 443
                    }[window.location.protocol] + ")?$"), "") !== window.location.host) {
                    return true;
                }
                return false;
            },

            /**
             * Checks to see if the url is an internal hash
             * @param   {string}    url - url being evaluated
             *
             */
            isHash: function(url) {
                var hasPathname = (url.indexOf(window.location.pathname) > 0) ? true : false,
                    hasHash = (url.indexOf("#") > 0) ? true : false;
                return (hasPathname && hasHash) ? true : false;
            },

            /**
             * Checks to see if we should be loading this URL
             * @param   {string}    url - url being evaluated
             * @param   {string}    blacklist - jquery selector
             *
             */
            shouldLoad: function($anchor, blacklist) {
                var url = $anchor.prop("href");
                // URL will only be loaded if it"s not an external link, hash, or blacklisted
                return (!utility.isExternal(url) && !utility.isHash(url) && !$anchor.is(blacklist));
            },

            /**
             * Prevents jQuery from stripping elements from $(html)
             * @param   {string}    url - url being evaluated
             * @author  Ben Alman   http://benalman.com/
             * @see     https://gist.github.com/cowboy/742952
             *
             */
            htmlDoc: function(html) {
                var parent,
                    elems = $(),
                    matchTag = /<(\/?)(html|head|body|title|base|meta)(\s+[^>]*)?>/ig,
                    prefix = "ss" + Math.round(Math.random() * 100000),
                    htmlParsed = html.replace(matchTag, function(tag, slash, name, attrs) {
                        var obj = {};
                        if (!slash) {
                            elems = elems.add("<" + name + "/>");
                            if (attrs) {
                                $.each($("<div" + attrs + "/>")[0].attributes, function(i, attr) {
                                    obj[attr.name] = attr.value;
                                });
                            }
                            elems.eq(-1).attr(obj);
                        }
                        return "<" + slash + "div" + (slash ? "" : " id='" + prefix + (elems.length - 1) + "'") + ">";
                    });

                // If no placeholder elements were necessary, just return normal
                // jQuery-parsed HTML.
                if (!elems.length) {
                    return $(html);
                }
                // Create parent node if it hasn"t been created yet.
                if (!parent) {
                    parent = $("<div/>");
                }
                // Create the parent node and append the parsed, place-held HTML.
                parent.html(htmlParsed);

                // Replace each placeholder element with its intended element.
                $.each(elems, function(i) {
                    var elem = parent.find("#" + prefix + i).before(elems[i]);
                    elems.eq(i).html(elem.contents());
                    elem.remove();
                });

                return parent.children().unwrap();
            },

            /**
             * Resets an object if it has too many properties
             *
             * This is used to clear the "cache" object that stores
             * all of the html. This would prevent the client from
             * running out of memory and allow the user to hit the
             * server for a fresh copy of the content.
             *
             * @param   {object}    obj
             * @param   {number}    cap
             *
             */
            clearIfOverCapacity: function(obj, cap) {
                // Polyfill Object.keys if it doesn"t exist
                if (!Object.keys) {
                    Object.keys = function(obj) {
                        var keys = [],
                            k;
                        for (k in obj) {
                            if (Object.prototype.hasOwnProperty.call(obj, k)) {
                                keys.push(k);
                            }
                        }
                        return keys;
                    };
                }

                if (Object.keys(obj).length > cap) {
                    obj = {};
                }

                return obj;
            },

            /**
             * Finds the inner content of an element, by an ID, from a jQuery object
             * @param   {string}    id
             * @param   {object}    $html
             *
             */
            getContentById: function(id, $html) {
                $html = ($html instanceof jQuery) ? $html : utility.htmlDoc($html);
                var $insideElem = $html.find(id),
                    updatedContainer = ($insideElem.length) ? $.trim($insideElem.html()) : $html.filter(id).html(),
                    newContent = (updatedContainer.length) ? $(updatedContainer) : null;
                return newContent;
            },

            /**
             * Stores html content as jquery object in given object
             * @param   {object}    object - object contents will be stored into
             * @param   {string}    url - url to be used as the prop
             * @param   {jquery}    html - contents to store
             *
             */
            storePageIn: function(object, url, $html) {
                $html = ($html instanceof jQuery) ? $html : utility.htmlDoc($html);
                object[url] = { // Content is indexed by the url
                    status: "loaded",
                    title: $html.find("title").text(), // Stores the title of the page
                    html: $html // Stores the contents of the page
                };
                return object;
            },

            /**
             * Triggers an "allanimationend" event when all animations are complete
             * @param   {object}    $element - jQuery object that should trigger event
             * @param   {string}    resetOn - which other events to trigger allanimationend on
             *
             */
            triggerAllAnimationEndEvent: function($element, resetOn) {

                resetOn = " " + resetOn || "";

                var animationCount = 0,
                    animationstart = "animationstart webkitAnimationStart oanimationstart MSAnimationStart",
                    animationend = "animationend webkitAnimationEnd oanimationend MSAnimationEnd",
                    eventname = "allanimationend",
                    onAnimationStart = function(e) {
                        if ($(e.delegateTarget).is($element)) {
                            e.stopPropagation();
                            animationCount++;
                        }
                    },
                    onAnimationEnd = function(e) {
                        if ($(e.delegateTarget).is($element)) {
                            e.stopPropagation();
                            animationCount--;
                            if (animationCount === 0) {
                                $element.trigger(eventname);
                            }
                        }
                    };

                $element.on(animationstart, onAnimationStart);
                $element.on(animationend, onAnimationEnd);

                $element.on("allanimationend" + resetOn, function() {
                    animationCount = 0;
                    utility.redraw($element);
                });
            },

            /** Forces browser to redraw elements */
            redraw: function($element) {
                $element.height(0);
                setTimeout(function() {
                    $element.height("auto");
                }, 0);
            }
        },

        /** Handles the popstate event, like when the user hits "back" */
        onPopState = function(e) {
            if (e.state !== null) {
                var url = window.location.href,
                    $page = $("#" + e.state.id),
                    page = $page.data("smoothState");

                if (page.href !== url && !utility.isHash(url)) {
                    page.load(url, true);
                }
            }
        },

        /** Constructor function  */
        SmoothState = function(element, options) {
            var
            /** Container element smoothState is run on */
                $container = $(element),

                /** Variable that stores pages after they are requested */
                cache = {},

                /** Url of the content that is currently displayed */
                currentHref = window.location.href,

                /**
                 * Loads the contents of a url into our container
                 *
                 * @param   {string}    url
                 * @param   {bool}      isPopped - used to determine if whe should
                 *                      add a new item into the history object
                 *
                 */
                load = function(url, isPopped) {

                    /** Makes this an optional variable by setting a default */
                    isPopped = isPopped || false;

                    var
                    /** Used to check if the onProgress function  has been run */
                        hasRunCallback = false,

                        callbBackEnded = false,

                        /** List of responses for the states of the page request */
                        responses = {

                            /** Page is ready, update the content */
                            loaded: function() {
                                var eventName = hasRunCallback ? "ss.onProgressEnd" : "ss.onStartEnd";

                                if (!callbBackEnded || !hasRunCallback) {
                                    $container.one(eventName, function() {
                                        updateContent(url);
                                    });
                                } else if (callbBackEnded) {
                                    updateContent(url);
                                }

                                if (!isPopped) {
                                    window.history.pushState({
                                        id: $container.prop("id")
                                    }, cache[url].title, url);
                                }
                            },

                            /** Loading, wait 10 ms and check again */
                            fetching: function() {

                                if (!hasRunCallback) {

                                    hasRunCallback = true;

                                    // Run the onProgress callback and set trigger
                                    $container.one("ss.onStartEnd", function() {
                                        options.onProgress.render(url, $container, null);

                                        setTimeout(function() {
                                            $container.trigger("ss.onProgressEnd");
                                            callbBackEnded = true;
                                        }, options.onStart.duration);

                                    });
                                }

                                setTimeout(function() {
                                    // Might of been canceled, better check!
                                    if (cache.hasOwnProperty(url)) {
                                        responses[cache[url].status]();
                                    }
                                }, 10);
                            },

                            /** Error, abort and redirect */
                            error: function() {
                                window.location = url;
                            }
                        };

                    if (!cache.hasOwnProperty(url)) {
                        fetch(url);
                    }

                    // Run the onStart callback and set trigger
                    options.onStart.render(url, $container, null);
                    setTimeout(function() {
                        $container.trigger("ss.onStartEnd");
                    }, options.onStart.duration);

                    // Start checking for the status of content
                    responses[cache[url].status]();

                },

                /** Updates the contents from cache[url] */
                updateContent = function(url) {
                    // If the content has been requested and is done:
                    var containerId = "#" + $container.prop("id"),
                        $content = cache[url] ? utility.getContentById(containerId, cache[url].html) : null;

                    if ($content) {
                        document.title = cache[url].title;
                        $container.data("smoothState").href = url;

                        // Call the onEnd callback and set trigger
                        options.onEnd.render(url, $container, $content);

                        $container.one("ss.onEndEnd", function() {
                            options.callback(url, $container, $content);
                        });

                        setTimeout(function() {
                            $container.trigger("ss.onEndEnd");
                        }, options.onEnd.duration);

                    } else if (!$content && options.development && consl) {
                        // Throw warning to help debug in development mode
                        consl.warn("No element with an id of " + containerId + " in response from " + url + " in " + cache);
                    } else {
                        // No content availble to update with, aborting...
                        window.location = url;
                    }
                },

                /**
                 * Fetches the contents of a url and stores it in the "cache" varible
                 * @param   {string}    url
                 *
                 */
                fetch = function(url) {

                    // Don"t fetch we have the content already
                    if (cache.hasOwnProperty(url)) {
                        return;
                    }

                    cache = utility.clearIfOverCapacity(cache, options.pageCacheSize);

                    cache[url] = {
                        status: "fetching"
                    };

                    var requestUrl = options.alterRequestUrl(url) || url,
                        request = $.ajax(requestUrl);

                    // Store contents in cache variable if successful
                    request.success(function(html) {
                        // Clear cache varible if it"s getting too big
                        utility.storePageIn(cache, url, html);
                        $container.data("smoothState").cache = cache;
                    });

                    // Mark as error
                    request.error(function() {
                        cache[url].status = "error";
                    });
                },
                /**
                 * Binds to the hover event of a link, used for prefetching content
                 *
                 * @param   {object}    event
                 *
                 */
                hoverAnchor = function(event) {
                    var $anchor = $(event.currentTarget),
                        url = $anchor.prop("href");
                    if (utility.shouldLoad($anchor, options.blacklist)) {
                        event.stopPropagation();
                        fetch(url);
                    }
                },

                /**
                 * Binds to the click event of a link, used to show the content
                 *
                 * @param   {object}    event
                 *
                 */
                clickAnchor = function(event) {
                    var $anchor = $(event.currentTarget),
                        url = $anchor.prop("href");

                    // Ctrl (or Cmd) + click must open a new tab
                    if (!event.metaKey && !event.ctrlKey && utility.shouldLoad($anchor, options.blacklist)) {
                        // stopPropagation so that event doesn"t fire on parent containers.
                        event.stopPropagation();
                        event.preventDefault();
                        load(url);
                    }
                },

                /**
                 * Binds all events and inits functionality
                 *
                 * @param   {object}    event
                 *
                 */
                bindEventHandlers = function($element) {
                    //@todo: Handle form submissions
                    $element.on("click", options.anchors, clickAnchor);

                    if (options.prefetch) {
                        $element.on("mouseover touchstart", options.anchors, hoverAnchor);
                    }

                },

                /** Used to restart css animations with a class */
                toggleAnimationClass = function(classname) {
                    var classes = $container.addClass(classname).prop("class");

                    $container.removeClass(classes);

                    setTimeout(function() {
                        $container.addClass(classes);
                    }, 0);

                    $container.one("ss.onStartEnd ss.onProgressEnd ss.onEndEnd", function() {
                        $container.removeClass(classname);
                    });

                };

            /** Override defaults with options passed in */
            options = $.extend(defaults, options);

            /** Sets a default state */
            if (window.history.state === null) {
                window.history.replaceState({
                    id: $container.prop("id")
                }, document.title, currentHref);
            }

            /** Stores the current page in cache variable */
            utility.storePageIn(cache, currentHref, document.documentElement.outerHTML);

            /** Bind all of the event handlers on the container, not anchors */
            utility.triggerAllAnimationEndEvent($container, "ss.onStartEnd ss.onProgressEnd ss.onEndEnd");

            /** Bind all of the event handlers on the container, not anchors */
            bindEventHandlers($container);

            /** Public methods */
            return {
                href: currentHref,
                cache: cache,
                load: load,
                fetch: fetch,
                toggleAnimationClass: toggleAnimationClass
            };
        },

        /** Returns elements with SmoothState attached to it */
        declareSmoothState = function(options) {
            return this.each(function() {
                // Checks to make sure the smoothState element has an id and isn"t already bound
                if (this.id && !$.data(this, "smoothState")) {
                    // Makes public methods available via $("element").data("smoothState");
                    $.data(this, "smoothState", new SmoothState(this, options));
                } else if (!this.id && consl) {
                    // Throw warning if in development mode
                    consl.warn("Every smoothState container needs an id but the following one does not have one:", this);
                }
            });
        };

    /** Sets the popstate function  */
    window.onpopstate = onPopState;

    /** Makes utility functions public for unit tests */
    $.smoothStateUtility = utility;

    /** Defines the smoothState plugin */
    $.fn.smoothState = declareSmoothState;

})(jQuery, window, document);

function addPImageClass() {
    $("p").has("img").addClass("markdown-image");
}

function caseStudyHover() {
    var caseStudy = $(".case");
    caseStudy.hover(function() {
        $(this).addClass("active");
    }, function() {
        $(this).removeClass("active");
    });
}

(function($) {
    'use strict';
    caseStudyHover();
    addPImageClass();

    var $body = $('html, body'),
        content = $('#ss-wrapper').smoothState({
            prefetch: true,
            pageCacheSize: 4,
            onStart: {
                duration: 250,
                render: function(url, $container) {
                    content.toggleAnimationClass('is-exiting');
                    $body.animate({
                        scrollTop: 0
                    });
                }
            },
            callback: function(url, $container, $content) {
                caseStudyHover();
                addPImageClass();

            }
        }).data('smoothState');

})(jQuery);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsIm5hbWVzIjpbXSwibWFwcGluZ3MiOiIiLCJzb3VyY2VzIjpbIm1haW4uanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIHNtb290aFN0YXRlLmpzIGlzIGEgalF1ZXJ5IHBsdWdpbiB0byBzdG9wIHBhZ2UgbG9hZCBqYW5rLlxyXG4gKlxyXG4gKiBUaGlzIGpRdWVyeSBwbHVnaW4gcHJvZ3Jlc3NpdmVseSBlbmhhbmNlcyBwYWdlIGxvYWRzIHRvXHJcbiAqIGJlaGF2ZSBtb3JlIGxpa2UgYSBzaW5nbGUtcGFnZSBhcHBsaWNhdGlvbi5cclxuICpcclxuICogQGF1dGhvciAgTWlndWVsIMOBbmdlbCBQw6lyZXogICByZWFjaG1lQG1pZ3VlbC1wZXJlei5jb21cclxuICogQHNlZSAgICAgaHR0cHM6Ly9naXRodWIuY29tL21pZ3VlbC1wZXJlei9qcXVlcnkuc21vb3RoU3RhdGUuanNcclxuICpcclxuICovXHJcbjtcclxuKGZ1bmN0aW9uKCQsIHdpbmRvdywgZG9jdW1lbnQsIHVuZGVmaW5lZCkge1xyXG4gICAgXCJ1c2Ugc3RyaWN0XCI7XHJcblxyXG4gICAgdmFyXHJcbiAgICAvKiogVXNlZCBsYXRlciB0byBzY3JvbGwgcGFnZSB0byB0aGUgdG9wICovXHJcbiAgICAgICAgJGJvZHkgPSAkKFwiaHRtbCwgYm9keVwiKSxcclxuXHJcbiAgICAgICAgLyoqIFVzZWQgaW4gZGV2ZWxvcG1lbnQgbW9kZSB0byBjb25zb2xlIG91dCB1c2VmdWwgd2FybmluZ3MgKi9cclxuICAgICAgICBjb25zbCA9ICh3aW5kb3cuY29uc29sZSB8fCBmYWxzZSksXHJcblxyXG4gICAgICAgIC8qKiBQbHVnaW4gZGVmYXVsdCBvcHRpb25zICovXHJcbiAgICAgICAgZGVmYXVsdHMgPSB7XHJcblxyXG4gICAgICAgICAgICAvKioganF1ZXJ5IGVsZW1lbnQgc3RyaW5nIHRvIHNwZWNpZnkgd2hpY2ggYW5jaG9ycyBzbW9vdGhzdGF0ZSBzaG91bGQgYmluZCB0byAqL1xyXG4gICAgICAgICAgICBhbmNob3JzOiBcImFcIixcclxuXHJcbiAgICAgICAgICAgIC8qKiBJZiBzZXQgdG8gdHJ1ZSwgc21vb3RoU3RhdGUgd2lsbCBwcmVmZXRjaCBhIGxpbmsncyBjb250ZW50cyBvbiBob3ZlciAqL1xyXG4gICAgICAgICAgICBwcmVmZXRjaDogZmFsc2UsXHJcblxyXG4gICAgICAgICAgICAvKiogQSBzZWxlY29yIHRoYXQgZGVpbmZlcyB3aXRoIGxpbmtzIHNob3VsZCBiZSBpZ25vcmVkIGJ5IHNtb290aFN0YXRlICovXHJcbiAgICAgICAgICAgIGJsYWNrbGlzdDogXCIubm8tc21vb3Roc3RhdGUsIFt0YXJnZXRdXCIsXHJcblxyXG4gICAgICAgICAgICAvKiogSWYgc2V0IHRvIHRydWUsIHNtb290aFN0YXRlIHdpbGwgbG9nIHVzZWZ1bCBkZWJ1ZyBpbmZvcm1hdGlvbiBpbnN0ZWFkIG9mIGFib3J0aW5nICovXHJcbiAgICAgICAgICAgIGRldmVsb3BtZW50OiBmYWxzZSxcclxuXHJcbiAgICAgICAgICAgIC8qKiBUaGUgbnVtYmVyIG9mIHBhZ2VzIHNtb290aFN0YXRlIHdpbGwgdHJ5IHRvIHN0b3JlIGluIG1lbW9yeSBhbmQgbm90IHJlcXVlc3QgYWdhaW4gKi9cclxuICAgICAgICAgICAgcGFnZUNhY2hlU2l6ZTogMCxcclxuXHJcbiAgICAgICAgICAgIC8qKiBBIGZ1bmN0aW9uICB0aGF0IGNhbiBiZSB1c2VkIHRvIGFsdGVyIHVybHMgYmVmb3JlIHRoZXkgYXJlIHVzZWQgdG8gcmVxdWVzdCBjb250ZW50ICovXHJcbiAgICAgICAgICAgIGFsdGVyUmVxdWVzdFVybDogZnVuY3Rpb24odXJsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdXJsO1xyXG4gICAgICAgICAgICB9LFxyXG5cclxuICAgICAgICAgICAgLyoqIFJ1biB3aGVuIGEgbGluayBoYXMgYmVlbiBhY3RpdmF0ZWQgKi9cclxuICAgICAgICAgICAgb25TdGFydDoge1xyXG4gICAgICAgICAgICAgICAgZHVyYXRpb246IDAsXHJcbiAgICAgICAgICAgICAgICByZW5kZXI6IGZ1bmN0aW9uKHVybCwgJGNvbnRhaW5lcikge1xyXG4gICAgICAgICAgICAgICAgICAgICRib2R5LnNjcm9sbFRvcCgwKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSxcclxuXHJcbiAgICAgICAgICAgIC8qKiBSdW4gaWYgdGhlIHBhZ2UgcmVxdWVzdCBpcyBzdGlsbCBwZW5kaW5nIGFuZCBvblN0YXJ0IGhhcyBmaW5pc2hlZCBhbmltYXRpbmcgKi9cclxuICAgICAgICAgICAgb25Qcm9ncmVzczoge1xyXG4gICAgICAgICAgICAgICAgZHVyYXRpb246IDAsXHJcbiAgICAgICAgICAgICAgICByZW5kZXI6IGZ1bmN0aW9uKHVybCwgJGNvbnRhaW5lcikge1xyXG4gICAgICAgICAgICAgICAgICAgICRib2R5LmNzcyhcImN1cnNvclwiLCBcIndhaXRcIik7XHJcbiAgICAgICAgICAgICAgICAgICAgJGJvZHkuZmluZChcImFcIikuY3NzKFwiY3Vyc29yXCIsIFwid2FpdFwiKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSxcclxuXHJcbiAgICAgICAgICAgIC8qKiBSdW4gd2hlbiByZXF1ZXN0ZWQgY29udGVudCBpcyByZWFkeSB0byBiZSBpbmplY3RlZCBpbnRvIHRoZSBwYWdlICAqL1xyXG4gICAgICAgICAgICBvbkVuZDoge1xyXG4gICAgICAgICAgICAgICAgZHVyYXRpb246IDAsXHJcbiAgICAgICAgICAgICAgICByZW5kZXI6IGZ1bmN0aW9uKHVybCwgJGNvbnRhaW5lciwgJGNvbnRlbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICAkYm9keS5jc3MoXCJjdXJzb3JcIiwgXCJhdXRvXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICRib2R5LmZpbmQoXCJhXCIpLmNzcyhcImN1cnNvclwiLCBcImF1dG9cIik7XHJcbiAgICAgICAgICAgICAgICAgICAgJGNvbnRhaW5lci5odG1sKCRjb250ZW50KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSxcclxuXHJcbiAgICAgICAgICAgIC8qKiBSdW4gd2hlbiBjb250ZW50IGhhcyBiZWVuIGluamVjdGVkIGFuZCBhbGwgYW5pbWF0aW9ucyBhcmUgY29tcGxldGUgICovXHJcbiAgICAgICAgICAgIGNhbGxiYWNrOiBmdW5jdGlvbih1cmwsICRjb250YWluZXIsICRjb250ZW50KSB7XHJcblxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgLyoqIFV0aWxpdHkgZnVuY3Rpb25zIHRoYXQgYXJlIGRlY291cGxlZCBmcm9tIFNtb290aFN0YXRlICovXHJcbiAgICAgICAgdXRpbGl0eSA9IHtcclxuXHJcbiAgICAgICAgICAgIC8qKlxyXG4gICAgICAgICAgICAgKiBDaGVja3MgdG8gc2VlIGlmIHRoZSB1cmwgaXMgZXh0ZXJuYWxcclxuICAgICAgICAgICAgICogQHBhcmFtICAge3N0cmluZ30gICAgdXJsIC0gdXJsIGJlaW5nIGV2YWx1YXRlZFxyXG4gICAgICAgICAgICAgKiBAc2VlICAgICBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzYyMzgzNTEvZmFzdGVzdC13YXktdG8tZGV0ZWN0LWV4dGVybmFsLXVybHNcclxuICAgICAgICAgICAgICpcclxuICAgICAgICAgICAgICovXHJcbiAgICAgICAgICAgIGlzRXh0ZXJuYWw6IGZ1bmN0aW9uKHVybCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIG1hdGNoID0gdXJsLm1hdGNoKC9eKFteOlxcLz8jXSs6KT8oPzpcXC9cXC8oW15cXC8/I10qKSk/KFtePyNdKyk/KFxcP1teI10qKT8oIy4qKT8vKTtcclxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgbWF0Y2hbMV0gPT09IFwic3RyaW5nXCIgJiYgbWF0Y2hbMV0ubGVuZ3RoID4gMCAmJiBtYXRjaFsxXS50b0xvd2VyQ2FzZSgpICE9PSB3aW5kb3cubG9jYXRpb24ucHJvdG9jb2wpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgbWF0Y2hbMl0gPT09IFwic3RyaW5nXCIgJiYgbWF0Y2hbMl0ubGVuZ3RoID4gMCAmJiBtYXRjaFsyXS5yZXBsYWNlKG5ldyBSZWdFeHAoXCI6KFwiICsge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBcImh0dHA6XCI6IDgwLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBcImh0dHBzOlwiOiA0NDNcclxuICAgICAgICAgICAgICAgICAgICB9W3dpbmRvdy5sb2NhdGlvbi5wcm90b2NvbF0gKyBcIik/JFwiKSwgXCJcIikgIT09IHdpbmRvdy5sb2NhdGlvbi5ob3N0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIH0sXHJcblxyXG4gICAgICAgICAgICAvKipcclxuICAgICAgICAgICAgICogQ2hlY2tzIHRvIHNlZSBpZiB0aGUgdXJsIGlzIGFuIGludGVybmFsIGhhc2hcclxuICAgICAgICAgICAgICogQHBhcmFtICAge3N0cmluZ30gICAgdXJsIC0gdXJsIGJlaW5nIGV2YWx1YXRlZFxyXG4gICAgICAgICAgICAgKlxyXG4gICAgICAgICAgICAgKi9cclxuICAgICAgICAgICAgaXNIYXNoOiBmdW5jdGlvbih1cmwpIHtcclxuICAgICAgICAgICAgICAgIHZhciBoYXNQYXRobmFtZSA9ICh1cmwuaW5kZXhPZih3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUpID4gMCkgPyB0cnVlIDogZmFsc2UsXHJcbiAgICAgICAgICAgICAgICAgICAgaGFzSGFzaCA9ICh1cmwuaW5kZXhPZihcIiNcIikgPiAwKSA/IHRydWUgOiBmYWxzZTtcclxuICAgICAgICAgICAgICAgIHJldHVybiAoaGFzUGF0aG5hbWUgJiYgaGFzSGFzaCkgPyB0cnVlIDogZmFsc2U7XHJcbiAgICAgICAgICAgIH0sXHJcblxyXG4gICAgICAgICAgICAvKipcclxuICAgICAgICAgICAgICogQ2hlY2tzIHRvIHNlZSBpZiB3ZSBzaG91bGQgYmUgbG9hZGluZyB0aGlzIFVSTFxyXG4gICAgICAgICAgICAgKiBAcGFyYW0gICB7c3RyaW5nfSAgICB1cmwgLSB1cmwgYmVpbmcgZXZhbHVhdGVkXHJcbiAgICAgICAgICAgICAqIEBwYXJhbSAgIHtzdHJpbmd9ICAgIGJsYWNrbGlzdCAtIGpxdWVyeSBzZWxlY3RvclxyXG4gICAgICAgICAgICAgKlxyXG4gICAgICAgICAgICAgKi9cclxuICAgICAgICAgICAgc2hvdWxkTG9hZDogZnVuY3Rpb24oJGFuY2hvciwgYmxhY2tsaXN0KSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgdXJsID0gJGFuY2hvci5wcm9wKFwiaHJlZlwiKTtcclxuICAgICAgICAgICAgICAgIC8vIFVSTCB3aWxsIG9ubHkgYmUgbG9hZGVkIGlmIGl0XCJzIG5vdCBhbiBleHRlcm5hbCBsaW5rLCBoYXNoLCBvciBibGFja2xpc3RlZFxyXG4gICAgICAgICAgICAgICAgcmV0dXJuICghdXRpbGl0eS5pc0V4dGVybmFsKHVybCkgJiYgIXV0aWxpdHkuaXNIYXNoKHVybCkgJiYgISRhbmNob3IuaXMoYmxhY2tsaXN0KSk7XHJcbiAgICAgICAgICAgIH0sXHJcblxyXG4gICAgICAgICAgICAvKipcclxuICAgICAgICAgICAgICogUHJldmVudHMgalF1ZXJ5IGZyb20gc3RyaXBwaW5nIGVsZW1lbnRzIGZyb20gJChodG1sKVxyXG4gICAgICAgICAgICAgKiBAcGFyYW0gICB7c3RyaW5nfSAgICB1cmwgLSB1cmwgYmVpbmcgZXZhbHVhdGVkXHJcbiAgICAgICAgICAgICAqIEBhdXRob3IgIEJlbiBBbG1hbiAgIGh0dHA6Ly9iZW5hbG1hbi5jb20vXHJcbiAgICAgICAgICAgICAqIEBzZWUgICAgIGh0dHBzOi8vZ2lzdC5naXRodWIuY29tL2Nvd2JveS83NDI5NTJcclxuICAgICAgICAgICAgICpcclxuICAgICAgICAgICAgICovXHJcbiAgICAgICAgICAgIGh0bWxEb2M6IGZ1bmN0aW9uKGh0bWwpIHtcclxuICAgICAgICAgICAgICAgIHZhciBwYXJlbnQsXHJcbiAgICAgICAgICAgICAgICAgICAgZWxlbXMgPSAkKCksXHJcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2hUYWcgPSAvPChcXC8/KShodG1sfGhlYWR8Ym9keXx0aXRsZXxiYXNlfG1ldGEpKFxccytbXj5dKik/Pi9pZyxcclxuICAgICAgICAgICAgICAgICAgICBwcmVmaXggPSBcInNzXCIgKyBNYXRoLnJvdW5kKE1hdGgucmFuZG9tKCkgKiAxMDAwMDApLFxyXG4gICAgICAgICAgICAgICAgICAgIGh0bWxQYXJzZWQgPSBodG1sLnJlcGxhY2UobWF0Y2hUYWcsIGZ1bmN0aW9uKHRhZywgc2xhc2gsIG5hbWUsIGF0dHJzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBvYmogPSB7fTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFzbGFzaCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbXMgPSBlbGVtcy5hZGQoXCI8XCIgKyBuYW1lICsgXCIvPlwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhdHRycykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICQuZWFjaCgkKFwiPGRpdlwiICsgYXR0cnMgKyBcIi8+XCIpWzBdLmF0dHJpYnV0ZXMsIGZ1bmN0aW9uKGksIGF0dHIpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb2JqW2F0dHIubmFtZV0gPSBhdHRyLnZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbXMuZXEoLTEpLmF0dHIob2JqKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCI8XCIgKyBzbGFzaCArIFwiZGl2XCIgKyAoc2xhc2ggPyBcIlwiIDogXCIgaWQ9J1wiICsgcHJlZml4ICsgKGVsZW1zLmxlbmd0aCAtIDEpICsgXCInXCIpICsgXCI+XCI7XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gSWYgbm8gcGxhY2Vob2xkZXIgZWxlbWVudHMgd2VyZSBuZWNlc3NhcnksIGp1c3QgcmV0dXJuIG5vcm1hbFxyXG4gICAgICAgICAgICAgICAgLy8galF1ZXJ5LXBhcnNlZCBIVE1MLlxyXG4gICAgICAgICAgICAgICAgaWYgKCFlbGVtcy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJChodG1sKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIC8vIENyZWF0ZSBwYXJlbnQgbm9kZSBpZiBpdCBoYXNuXCJ0IGJlZW4gY3JlYXRlZCB5ZXQuXHJcbiAgICAgICAgICAgICAgICBpZiAoIXBhcmVudCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudCA9ICQoXCI8ZGl2Lz5cIik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAvLyBDcmVhdGUgdGhlIHBhcmVudCBub2RlIGFuZCBhcHBlbmQgdGhlIHBhcnNlZCwgcGxhY2UtaGVsZCBIVE1MLlxyXG4gICAgICAgICAgICAgICAgcGFyZW50Lmh0bWwoaHRtbFBhcnNlZCk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gUmVwbGFjZSBlYWNoIHBsYWNlaG9sZGVyIGVsZW1lbnQgd2l0aCBpdHMgaW50ZW5kZWQgZWxlbWVudC5cclxuICAgICAgICAgICAgICAgICQuZWFjaChlbGVtcywgZnVuY3Rpb24oaSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBlbGVtID0gcGFyZW50LmZpbmQoXCIjXCIgKyBwcmVmaXggKyBpKS5iZWZvcmUoZWxlbXNbaV0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGVsZW1zLmVxKGkpLmh0bWwoZWxlbS5jb250ZW50cygpKTtcclxuICAgICAgICAgICAgICAgICAgICBlbGVtLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHBhcmVudC5jaGlsZHJlbigpLnVud3JhcCgpO1xyXG4gICAgICAgICAgICB9LFxyXG5cclxuICAgICAgICAgICAgLyoqXHJcbiAgICAgICAgICAgICAqIFJlc2V0cyBhbiBvYmplY3QgaWYgaXQgaGFzIHRvbyBtYW55IHByb3BlcnRpZXNcclxuICAgICAgICAgICAgICpcclxuICAgICAgICAgICAgICogVGhpcyBpcyB1c2VkIHRvIGNsZWFyIHRoZSBcImNhY2hlXCIgb2JqZWN0IHRoYXQgc3RvcmVzXHJcbiAgICAgICAgICAgICAqIGFsbCBvZiB0aGUgaHRtbC4gVGhpcyB3b3VsZCBwcmV2ZW50IHRoZSBjbGllbnQgZnJvbVxyXG4gICAgICAgICAgICAgKiBydW5uaW5nIG91dCBvZiBtZW1vcnkgYW5kIGFsbG93IHRoZSB1c2VyIHRvIGhpdCB0aGVcclxuICAgICAgICAgICAgICogc2VydmVyIGZvciBhIGZyZXNoIGNvcHkgb2YgdGhlIGNvbnRlbnQuXHJcbiAgICAgICAgICAgICAqXHJcbiAgICAgICAgICAgICAqIEBwYXJhbSAgIHtvYmplY3R9ICAgIG9ialxyXG4gICAgICAgICAgICAgKiBAcGFyYW0gICB7bnVtYmVyfSAgICBjYXBcclxuICAgICAgICAgICAgICpcclxuICAgICAgICAgICAgICovXHJcbiAgICAgICAgICAgIGNsZWFySWZPdmVyQ2FwYWNpdHk6IGZ1bmN0aW9uKG9iaiwgY2FwKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBQb2x5ZmlsbCBPYmplY3Qua2V5cyBpZiBpdCBkb2VzblwidCBleGlzdFxyXG4gICAgICAgICAgICAgICAgaWYgKCFPYmplY3Qua2V5cykge1xyXG4gICAgICAgICAgICAgICAgICAgIE9iamVjdC5rZXlzID0gZnVuY3Rpb24ob2JqKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBrZXlzID0gW10sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBrO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGsgaW4gb2JqKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgaykpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBrZXlzLnB1c2goayk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGtleXM7XHJcbiAgICAgICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoT2JqZWN0LmtleXMob2JqKS5sZW5ndGggPiBjYXApIHtcclxuICAgICAgICAgICAgICAgICAgICBvYmogPSB7fTtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gb2JqO1xyXG4gICAgICAgICAgICB9LFxyXG5cclxuICAgICAgICAgICAgLyoqXHJcbiAgICAgICAgICAgICAqIEZpbmRzIHRoZSBpbm5lciBjb250ZW50IG9mIGFuIGVsZW1lbnQsIGJ5IGFuIElELCBmcm9tIGEgalF1ZXJ5IG9iamVjdFxyXG4gICAgICAgICAgICAgKiBAcGFyYW0gICB7c3RyaW5nfSAgICBpZFxyXG4gICAgICAgICAgICAgKiBAcGFyYW0gICB7b2JqZWN0fSAgICAkaHRtbFxyXG4gICAgICAgICAgICAgKlxyXG4gICAgICAgICAgICAgKi9cclxuICAgICAgICAgICAgZ2V0Q29udGVudEJ5SWQ6IGZ1bmN0aW9uKGlkLCAkaHRtbCkge1xyXG4gICAgICAgICAgICAgICAgJGh0bWwgPSAoJGh0bWwgaW5zdGFuY2VvZiBqUXVlcnkpID8gJGh0bWwgOiB1dGlsaXR5Lmh0bWxEb2MoJGh0bWwpO1xyXG4gICAgICAgICAgICAgICAgdmFyICRpbnNpZGVFbGVtID0gJGh0bWwuZmluZChpZCksXHJcbiAgICAgICAgICAgICAgICAgICAgdXBkYXRlZENvbnRhaW5lciA9ICgkaW5zaWRlRWxlbS5sZW5ndGgpID8gJC50cmltKCRpbnNpZGVFbGVtLmh0bWwoKSkgOiAkaHRtbC5maWx0ZXIoaWQpLmh0bWwoKSxcclxuICAgICAgICAgICAgICAgICAgICBuZXdDb250ZW50ID0gKHVwZGF0ZWRDb250YWluZXIubGVuZ3RoKSA/ICQodXBkYXRlZENvbnRhaW5lcikgOiBudWxsO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ld0NvbnRlbnQ7XHJcbiAgICAgICAgICAgIH0sXHJcblxyXG4gICAgICAgICAgICAvKipcclxuICAgICAgICAgICAgICogU3RvcmVzIGh0bWwgY29udGVudCBhcyBqcXVlcnkgb2JqZWN0IGluIGdpdmVuIG9iamVjdFxyXG4gICAgICAgICAgICAgKiBAcGFyYW0gICB7b2JqZWN0fSAgICBvYmplY3QgLSBvYmplY3QgY29udGVudHMgd2lsbCBiZSBzdG9yZWQgaW50b1xyXG4gICAgICAgICAgICAgKiBAcGFyYW0gICB7c3RyaW5nfSAgICB1cmwgLSB1cmwgdG8gYmUgdXNlZCBhcyB0aGUgcHJvcFxyXG4gICAgICAgICAgICAgKiBAcGFyYW0gICB7anF1ZXJ5fSAgICBodG1sIC0gY29udGVudHMgdG8gc3RvcmVcclxuICAgICAgICAgICAgICpcclxuICAgICAgICAgICAgICovXHJcbiAgICAgICAgICAgIHN0b3JlUGFnZUluOiBmdW5jdGlvbihvYmplY3QsIHVybCwgJGh0bWwpIHtcclxuICAgICAgICAgICAgICAgICRodG1sID0gKCRodG1sIGluc3RhbmNlb2YgalF1ZXJ5KSA/ICRodG1sIDogdXRpbGl0eS5odG1sRG9jKCRodG1sKTtcclxuICAgICAgICAgICAgICAgIG9iamVjdFt1cmxdID0geyAvLyBDb250ZW50IGlzIGluZGV4ZWQgYnkgdGhlIHVybFxyXG4gICAgICAgICAgICAgICAgICAgIHN0YXR1czogXCJsb2FkZWRcIixcclxuICAgICAgICAgICAgICAgICAgICB0aXRsZTogJGh0bWwuZmluZChcInRpdGxlXCIpLnRleHQoKSwgLy8gU3RvcmVzIHRoZSB0aXRsZSBvZiB0aGUgcGFnZVxyXG4gICAgICAgICAgICAgICAgICAgIGh0bWw6ICRodG1sIC8vIFN0b3JlcyB0aGUgY29udGVudHMgb2YgdGhlIHBhZ2VcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gb2JqZWN0O1xyXG4gICAgICAgICAgICB9LFxyXG5cclxuICAgICAgICAgICAgLyoqXHJcbiAgICAgICAgICAgICAqIFRyaWdnZXJzIGFuIFwiYWxsYW5pbWF0aW9uZW5kXCIgZXZlbnQgd2hlbiBhbGwgYW5pbWF0aW9ucyBhcmUgY29tcGxldGVcclxuICAgICAgICAgICAgICogQHBhcmFtICAge29iamVjdH0gICAgJGVsZW1lbnQgLSBqUXVlcnkgb2JqZWN0IHRoYXQgc2hvdWxkIHRyaWdnZXIgZXZlbnRcclxuICAgICAgICAgICAgICogQHBhcmFtICAge3N0cmluZ30gICAgcmVzZXRPbiAtIHdoaWNoIG90aGVyIGV2ZW50cyB0byB0cmlnZ2VyIGFsbGFuaW1hdGlvbmVuZCBvblxyXG4gICAgICAgICAgICAgKlxyXG4gICAgICAgICAgICAgKi9cclxuICAgICAgICAgICAgdHJpZ2dlckFsbEFuaW1hdGlvbkVuZEV2ZW50OiBmdW5jdGlvbigkZWxlbWVudCwgcmVzZXRPbikge1xyXG5cclxuICAgICAgICAgICAgICAgIHJlc2V0T24gPSBcIiBcIiArIHJlc2V0T24gfHwgXCJcIjtcclxuXHJcbiAgICAgICAgICAgICAgICB2YXIgYW5pbWF0aW9uQ291bnQgPSAwLFxyXG4gICAgICAgICAgICAgICAgICAgIGFuaW1hdGlvbnN0YXJ0ID0gXCJhbmltYXRpb25zdGFydCB3ZWJraXRBbmltYXRpb25TdGFydCBvYW5pbWF0aW9uc3RhcnQgTVNBbmltYXRpb25TdGFydFwiLFxyXG4gICAgICAgICAgICAgICAgICAgIGFuaW1hdGlvbmVuZCA9IFwiYW5pbWF0aW9uZW5kIHdlYmtpdEFuaW1hdGlvbkVuZCBvYW5pbWF0aW9uZW5kIE1TQW5pbWF0aW9uRW5kXCIsXHJcbiAgICAgICAgICAgICAgICAgICAgZXZlbnRuYW1lID0gXCJhbGxhbmltYXRpb25lbmRcIixcclxuICAgICAgICAgICAgICAgICAgICBvbkFuaW1hdGlvblN0YXJ0ID0gZnVuY3Rpb24oZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoJChlLmRlbGVnYXRlVGFyZ2V0KS5pcygkZWxlbWVudCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhbmltYXRpb25Db3VudCsrO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgICAgICBvbkFuaW1hdGlvbkVuZCA9IGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCQoZS5kZWxlZ2F0ZVRhcmdldCkuaXMoJGVsZW1lbnQpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYW5pbWF0aW9uQ291bnQtLTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChhbmltYXRpb25Db3VudCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICRlbGVtZW50LnRyaWdnZXIoZXZlbnRuYW1lKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICAgICAgJGVsZW1lbnQub24oYW5pbWF0aW9uc3RhcnQsIG9uQW5pbWF0aW9uU3RhcnQpO1xyXG4gICAgICAgICAgICAgICAgJGVsZW1lbnQub24oYW5pbWF0aW9uZW5kLCBvbkFuaW1hdGlvbkVuZCk7XHJcblxyXG4gICAgICAgICAgICAgICAgJGVsZW1lbnQub24oXCJhbGxhbmltYXRpb25lbmRcIiArIHJlc2V0T24sIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGFuaW1hdGlvbkNvdW50ID0gMDtcclxuICAgICAgICAgICAgICAgICAgICB1dGlsaXR5LnJlZHJhdygkZWxlbWVudCk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSxcclxuXHJcbiAgICAgICAgICAgIC8qKiBGb3JjZXMgYnJvd3NlciB0byByZWRyYXcgZWxlbWVudHMgKi9cclxuICAgICAgICAgICAgcmVkcmF3OiBmdW5jdGlvbigkZWxlbWVudCkge1xyXG4gICAgICAgICAgICAgICAgJGVsZW1lbnQuaGVpZ2h0KDApO1xyXG4gICAgICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgICAgICAkZWxlbWVudC5oZWlnaHQoXCJhdXRvXCIpO1xyXG4gICAgICAgICAgICAgICAgfSwgMCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG5cclxuICAgICAgICAvKiogSGFuZGxlcyB0aGUgcG9wc3RhdGUgZXZlbnQsIGxpa2Ugd2hlbiB0aGUgdXNlciBoaXRzIFwiYmFja1wiICovXHJcbiAgICAgICAgb25Qb3BTdGF0ZSA9IGZ1bmN0aW9uKGUpIHtcclxuICAgICAgICAgICAgaWYgKGUuc3RhdGUgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHZhciB1cmwgPSB3aW5kb3cubG9jYXRpb24uaHJlZixcclxuICAgICAgICAgICAgICAgICAgICAkcGFnZSA9ICQoXCIjXCIgKyBlLnN0YXRlLmlkKSxcclxuICAgICAgICAgICAgICAgICAgICBwYWdlID0gJHBhZ2UuZGF0YShcInNtb290aFN0YXRlXCIpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChwYWdlLmhyZWYgIT09IHVybCAmJiAhdXRpbGl0eS5pc0hhc2godXJsKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHBhZ2UubG9hZCh1cmwsIHRydWUpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgLyoqIENvbnN0cnVjdG9yIGZ1bmN0aW9uICAqL1xyXG4gICAgICAgIFNtb290aFN0YXRlID0gZnVuY3Rpb24oZWxlbWVudCwgb3B0aW9ucykge1xyXG4gICAgICAgICAgICB2YXJcclxuICAgICAgICAgICAgLyoqIENvbnRhaW5lciBlbGVtZW50IHNtb290aFN0YXRlIGlzIHJ1biBvbiAqL1xyXG4gICAgICAgICAgICAgICAgJGNvbnRhaW5lciA9ICQoZWxlbWVudCksXHJcblxyXG4gICAgICAgICAgICAgICAgLyoqIFZhcmlhYmxlIHRoYXQgc3RvcmVzIHBhZ2VzIGFmdGVyIHRoZXkgYXJlIHJlcXVlc3RlZCAqL1xyXG4gICAgICAgICAgICAgICAgY2FjaGUgPSB7fSxcclxuXHJcbiAgICAgICAgICAgICAgICAvKiogVXJsIG9mIHRoZSBjb250ZW50IHRoYXQgaXMgY3VycmVudGx5IGRpc3BsYXllZCAqL1xyXG4gICAgICAgICAgICAgICAgY3VycmVudEhyZWYgPSB3aW5kb3cubG9jYXRpb24uaHJlZixcclxuXHJcbiAgICAgICAgICAgICAgICAvKipcclxuICAgICAgICAgICAgICAgICAqIExvYWRzIHRoZSBjb250ZW50cyBvZiBhIHVybCBpbnRvIG91ciBjb250YWluZXJcclxuICAgICAgICAgICAgICAgICAqXHJcbiAgICAgICAgICAgICAgICAgKiBAcGFyYW0gICB7c3RyaW5nfSAgICB1cmxcclxuICAgICAgICAgICAgICAgICAqIEBwYXJhbSAgIHtib29sfSAgICAgIGlzUG9wcGVkIC0gdXNlZCB0byBkZXRlcm1pbmUgaWYgd2hlIHNob3VsZFxyXG4gICAgICAgICAgICAgICAgICogICAgICAgICAgICAgICAgICAgICAgYWRkIGEgbmV3IGl0ZW0gaW50byB0aGUgaGlzdG9yeSBvYmplY3RcclxuICAgICAgICAgICAgICAgICAqXHJcbiAgICAgICAgICAgICAgICAgKi9cclxuICAgICAgICAgICAgICAgIGxvYWQgPSBmdW5jdGlvbih1cmwsIGlzUG9wcGVkKSB7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8qKiBNYWtlcyB0aGlzIGFuIG9wdGlvbmFsIHZhcmlhYmxlIGJ5IHNldHRpbmcgYSBkZWZhdWx0ICovXHJcbiAgICAgICAgICAgICAgICAgICAgaXNQb3BwZWQgPSBpc1BvcHBlZCB8fCBmYWxzZTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgdmFyXHJcbiAgICAgICAgICAgICAgICAgICAgLyoqIFVzZWQgdG8gY2hlY2sgaWYgdGhlIG9uUHJvZ3Jlc3MgZnVuY3Rpb24gIGhhcyBiZWVuIHJ1biAqL1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBoYXNSdW5DYWxsYmFjayA9IGZhbHNlLFxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJCYWNrRW5kZWQgPSBmYWxzZSxcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8qKiBMaXN0IG9mIHJlc3BvbnNlcyBmb3IgdGhlIHN0YXRlcyBvZiB0aGUgcGFnZSByZXF1ZXN0ICovXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc3BvbnNlcyA9IHtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiogUGFnZSBpcyByZWFkeSwgdXBkYXRlIHRoZSBjb250ZW50ICovXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsb2FkZWQ6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBldmVudE5hbWUgPSBoYXNSdW5DYWxsYmFjayA/IFwic3Mub25Qcm9ncmVzc0VuZFwiIDogXCJzcy5vblN0YXJ0RW5kXCI7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghY2FsbGJCYWNrRW5kZWQgfHwgIWhhc1J1bkNhbGxiYWNrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICRjb250YWluZXIub25lKGV2ZW50TmFtZSwgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVDb250ZW50KHVybCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoY2FsbGJCYWNrRW5kZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlQ29udGVudCh1cmwpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFpc1BvcHBlZCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aW5kb3cuaGlzdG9yeS5wdXNoU3RhdGUoe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWQ6ICRjb250YWluZXIucHJvcChcImlkXCIpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sIGNhY2hlW3VybF0udGl0bGUsIHVybCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvKiogTG9hZGluZywgd2FpdCAxMCBtcyBhbmQgY2hlY2sgYWdhaW4gKi9cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZldGNoaW5nOiBmdW5jdGlvbigpIHtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFoYXNSdW5DYWxsYmFjaykge1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGFzUnVuQ2FsbGJhY2sgPSB0cnVlO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gUnVuIHRoZSBvblByb2dyZXNzIGNhbGxiYWNrIGFuZCBzZXQgdHJpZ2dlclxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAkY29udGFpbmVyLm9uZShcInNzLm9uU3RhcnRFbmRcIiwgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zLm9uUHJvZ3Jlc3MucmVuZGVyKHVybCwgJGNvbnRhaW5lciwgbnVsbCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAkY29udGFpbmVyLnRyaWdnZXIoXCJzcy5vblByb2dyZXNzRW5kXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiQmFja0VuZGVkID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sIG9wdGlvbnMub25TdGFydC5kdXJhdGlvbik7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIE1pZ2h0IG9mIGJlZW4gY2FuY2VsZWQsIGJldHRlciBjaGVjayFcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNhY2hlLmhhc093blByb3BlcnR5KHVybCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3BvbnNlc1tjYWNoZVt1cmxdLnN0YXR1c10oKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sIDEwKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLyoqIEVycm9yLCBhYm9ydCBhbmQgcmVkaXJlY3QgKi9cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aW5kb3cubG9jYXRpb24gPSB1cmw7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmICghY2FjaGUuaGFzT3duUHJvcGVydHkodXJsKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBmZXRjaCh1cmwpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gUnVuIHRoZSBvblN0YXJ0IGNhbGxiYWNrIGFuZCBzZXQgdHJpZ2dlclxyXG4gICAgICAgICAgICAgICAgICAgIG9wdGlvbnMub25TdGFydC5yZW5kZXIodXJsLCAkY29udGFpbmVyLCBudWxsKTtcclxuICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAkY29udGFpbmVyLnRyaWdnZXIoXCJzcy5vblN0YXJ0RW5kXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0sIG9wdGlvbnMub25TdGFydC5kdXJhdGlvbik7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIFN0YXJ0IGNoZWNraW5nIGZvciB0aGUgc3RhdHVzIG9mIGNvbnRlbnRcclxuICAgICAgICAgICAgICAgICAgICByZXNwb25zZXNbY2FjaGVbdXJsXS5zdGF0dXNdKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgfSxcclxuXHJcbiAgICAgICAgICAgICAgICAvKiogVXBkYXRlcyB0aGUgY29udGVudHMgZnJvbSBjYWNoZVt1cmxdICovXHJcbiAgICAgICAgICAgICAgICB1cGRhdGVDb250ZW50ID0gZnVuY3Rpb24odXJsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgdGhlIGNvbnRlbnQgaGFzIGJlZW4gcmVxdWVzdGVkIGFuZCBpcyBkb25lOlxyXG4gICAgICAgICAgICAgICAgICAgIHZhciBjb250YWluZXJJZCA9IFwiI1wiICsgJGNvbnRhaW5lci5wcm9wKFwiaWRcIiksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICRjb250ZW50ID0gY2FjaGVbdXJsXSA/IHV0aWxpdHkuZ2V0Q29udGVudEJ5SWQoY29udGFpbmVySWQsIGNhY2hlW3VybF0uaHRtbCkgOiBudWxsO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoJGNvbnRlbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQudGl0bGUgPSBjYWNoZVt1cmxdLnRpdGxlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAkY29udGFpbmVyLmRhdGEoXCJzbW9vdGhTdGF0ZVwiKS5ocmVmID0gdXJsO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ2FsbCB0aGUgb25FbmQgY2FsbGJhY2sgYW5kIHNldCB0cmlnZ2VyXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMub25FbmQucmVuZGVyKHVybCwgJGNvbnRhaW5lciwgJGNvbnRlbnQpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgJGNvbnRhaW5lci5vbmUoXCJzcy5vbkVuZEVuZFwiLCBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMuY2FsbGJhY2sodXJsLCAkY29udGFpbmVyLCAkY29udGVudCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICRjb250YWluZXIudHJpZ2dlcihcInNzLm9uRW5kRW5kXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9LCBvcHRpb25zLm9uRW5kLmR1cmF0aW9uKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICghJGNvbnRlbnQgJiYgb3B0aW9ucy5kZXZlbG9wbWVudCAmJiBjb25zbCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBUaHJvdyB3YXJuaW5nIHRvIGhlbHAgZGVidWcgaW4gZGV2ZWxvcG1lbnQgbW9kZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zbC53YXJuKFwiTm8gZWxlbWVudCB3aXRoIGFuIGlkIG9mIFwiICsgY29udGFpbmVySWQgKyBcIiBpbiByZXNwb25zZSBmcm9tIFwiICsgdXJsICsgXCIgaW4gXCIgKyBjYWNoZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gTm8gY29udGVudCBhdmFpbGJsZSB0byB1cGRhdGUgd2l0aCwgYWJvcnRpbmcuLi5cclxuICAgICAgICAgICAgICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uID0gdXJsO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0sXHJcblxyXG4gICAgICAgICAgICAgICAgLyoqXHJcbiAgICAgICAgICAgICAgICAgKiBGZXRjaGVzIHRoZSBjb250ZW50cyBvZiBhIHVybCBhbmQgc3RvcmVzIGl0IGluIHRoZSBcImNhY2hlXCIgdmFyaWJsZVxyXG4gICAgICAgICAgICAgICAgICogQHBhcmFtICAge3N0cmluZ30gICAgdXJsXHJcbiAgICAgICAgICAgICAgICAgKlxyXG4gICAgICAgICAgICAgICAgICovXHJcbiAgICAgICAgICAgICAgICBmZXRjaCA9IGZ1bmN0aW9uKHVybCkge1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAvLyBEb25cInQgZmV0Y2ggd2UgaGF2ZSB0aGUgY29udGVudCBhbHJlYWR5XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNhY2hlLmhhc093blByb3BlcnR5KHVybCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgY2FjaGUgPSB1dGlsaXR5LmNsZWFySWZPdmVyQ2FwYWNpdHkoY2FjaGUsIG9wdGlvbnMucGFnZUNhY2hlU2l6ZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGNhY2hlW3VybF0gPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXR1czogXCJmZXRjaGluZ1wiXHJcbiAgICAgICAgICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHJlcXVlc3RVcmwgPSBvcHRpb25zLmFsdGVyUmVxdWVzdFVybCh1cmwpIHx8IHVybCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmVxdWVzdCA9ICQuYWpheChyZXF1ZXN0VXJsKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gU3RvcmUgY29udGVudHMgaW4gY2FjaGUgdmFyaWFibGUgaWYgc3VjY2Vzc2Z1bFxyXG4gICAgICAgICAgICAgICAgICAgIHJlcXVlc3Quc3VjY2VzcyhmdW5jdGlvbihodG1sKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIENsZWFyIGNhY2hlIHZhcmlibGUgaWYgaXRcInMgZ2V0dGluZyB0b28gYmlnXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV0aWxpdHkuc3RvcmVQYWdlSW4oY2FjaGUsIHVybCwgaHRtbCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICRjb250YWluZXIuZGF0YShcInNtb290aFN0YXRlXCIpLmNhY2hlID0gY2FjaGU7XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIE1hcmsgYXMgZXJyb3JcclxuICAgICAgICAgICAgICAgICAgICByZXF1ZXN0LmVycm9yKGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjYWNoZVt1cmxdLnN0YXR1cyA9IFwiZXJyb3JcIjtcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAvKipcclxuICAgICAgICAgICAgICAgICAqIEJpbmRzIHRvIHRoZSBob3ZlciBldmVudCBvZiBhIGxpbmssIHVzZWQgZm9yIHByZWZldGNoaW5nIGNvbnRlbnRcclxuICAgICAgICAgICAgICAgICAqXHJcbiAgICAgICAgICAgICAgICAgKiBAcGFyYW0gICB7b2JqZWN0fSAgICBldmVudFxyXG4gICAgICAgICAgICAgICAgICpcclxuICAgICAgICAgICAgICAgICAqL1xyXG4gICAgICAgICAgICAgICAgaG92ZXJBbmNob3IgPSBmdW5jdGlvbihldmVudCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciAkYW5jaG9yID0gJChldmVudC5jdXJyZW50VGFyZ2V0KSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdXJsID0gJGFuY2hvci5wcm9wKFwiaHJlZlwiKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodXRpbGl0eS5zaG91bGRMb2FkKCRhbmNob3IsIG9wdGlvbnMuYmxhY2tsaXN0KSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmV0Y2godXJsKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9LFxyXG5cclxuICAgICAgICAgICAgICAgIC8qKlxyXG4gICAgICAgICAgICAgICAgICogQmluZHMgdG8gdGhlIGNsaWNrIGV2ZW50IG9mIGEgbGluaywgdXNlZCB0byBzaG93IHRoZSBjb250ZW50XHJcbiAgICAgICAgICAgICAgICAgKlxyXG4gICAgICAgICAgICAgICAgICogQHBhcmFtICAge29iamVjdH0gICAgZXZlbnRcclxuICAgICAgICAgICAgICAgICAqXHJcbiAgICAgICAgICAgICAgICAgKi9cclxuICAgICAgICAgICAgICAgIGNsaWNrQW5jaG9yID0gZnVuY3Rpb24oZXZlbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgJGFuY2hvciA9ICQoZXZlbnQuY3VycmVudFRhcmdldCksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHVybCA9ICRhbmNob3IucHJvcChcImhyZWZcIik7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIEN0cmwgKG9yIENtZCkgKyBjbGljayBtdXN0IG9wZW4gYSBuZXcgdGFiXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFldmVudC5tZXRhS2V5ICYmICFldmVudC5jdHJsS2V5ICYmIHV0aWxpdHkuc2hvdWxkTG9hZCgkYW5jaG9yLCBvcHRpb25zLmJsYWNrbGlzdCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gc3RvcFByb3BhZ2F0aW9uIHNvIHRoYXQgZXZlbnQgZG9lc25cInQgZmlyZSBvbiBwYXJlbnQgY29udGFpbmVycy5cclxuICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxvYWQodXJsKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9LFxyXG5cclxuICAgICAgICAgICAgICAgIC8qKlxyXG4gICAgICAgICAgICAgICAgICogQmluZHMgYWxsIGV2ZW50cyBhbmQgaW5pdHMgZnVuY3Rpb25hbGl0eVxyXG4gICAgICAgICAgICAgICAgICpcclxuICAgICAgICAgICAgICAgICAqIEBwYXJhbSAgIHtvYmplY3R9ICAgIGV2ZW50XHJcbiAgICAgICAgICAgICAgICAgKlxyXG4gICAgICAgICAgICAgICAgICovXHJcbiAgICAgICAgICAgICAgICBiaW5kRXZlbnRIYW5kbGVycyA9IGZ1bmN0aW9uKCRlbGVtZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy9AdG9kbzogSGFuZGxlIGZvcm0gc3VibWlzc2lvbnNcclxuICAgICAgICAgICAgICAgICAgICAkZWxlbWVudC5vbihcImNsaWNrXCIsIG9wdGlvbnMuYW5jaG9ycywgY2xpY2tBbmNob3IpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAob3B0aW9ucy5wcmVmZXRjaCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAkZWxlbWVudC5vbihcIm1vdXNlb3ZlciB0b3VjaHN0YXJ0XCIsIG9wdGlvbnMuYW5jaG9ycywgaG92ZXJBbmNob3IpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICB9LFxyXG5cclxuICAgICAgICAgICAgICAgIC8qKiBVc2VkIHRvIHJlc3RhcnQgY3NzIGFuaW1hdGlvbnMgd2l0aCBhIGNsYXNzICovXHJcbiAgICAgICAgICAgICAgICB0b2dnbGVBbmltYXRpb25DbGFzcyA9IGZ1bmN0aW9uKGNsYXNzbmFtZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBjbGFzc2VzID0gJGNvbnRhaW5lci5hZGRDbGFzcyhjbGFzc25hbWUpLnByb3AoXCJjbGFzc1wiKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgJGNvbnRhaW5lci5yZW1vdmVDbGFzcyhjbGFzc2VzKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJGNvbnRhaW5lci5hZGRDbGFzcyhjbGFzc2VzKTtcclxuICAgICAgICAgICAgICAgICAgICB9LCAwKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgJGNvbnRhaW5lci5vbmUoXCJzcy5vblN0YXJ0RW5kIHNzLm9uUHJvZ3Jlc3NFbmQgc3Mub25FbmRFbmRcIiwgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICRjb250YWluZXIucmVtb3ZlQ2xhc3MoY2xhc3NuYW1lKTtcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgLyoqIE92ZXJyaWRlIGRlZmF1bHRzIHdpdGggb3B0aW9ucyBwYXNzZWQgaW4gKi9cclxuICAgICAgICAgICAgb3B0aW9ucyA9ICQuZXh0ZW5kKGRlZmF1bHRzLCBvcHRpb25zKTtcclxuXHJcbiAgICAgICAgICAgIC8qKiBTZXRzIGEgZGVmYXVsdCBzdGF0ZSAqL1xyXG4gICAgICAgICAgICBpZiAod2luZG93Lmhpc3Rvcnkuc3RhdGUgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHdpbmRvdy5oaXN0b3J5LnJlcGxhY2VTdGF0ZSh7XHJcbiAgICAgICAgICAgICAgICAgICAgaWQ6ICRjb250YWluZXIucHJvcChcImlkXCIpXHJcbiAgICAgICAgICAgICAgICB9LCBkb2N1bWVudC50aXRsZSwgY3VycmVudEhyZWYpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvKiogU3RvcmVzIHRoZSBjdXJyZW50IHBhZ2UgaW4gY2FjaGUgdmFyaWFibGUgKi9cclxuICAgICAgICAgICAgdXRpbGl0eS5zdG9yZVBhZ2VJbihjYWNoZSwgY3VycmVudEhyZWYsIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5vdXRlckhUTUwpO1xyXG5cclxuICAgICAgICAgICAgLyoqIEJpbmQgYWxsIG9mIHRoZSBldmVudCBoYW5kbGVycyBvbiB0aGUgY29udGFpbmVyLCBub3QgYW5jaG9ycyAqL1xyXG4gICAgICAgICAgICB1dGlsaXR5LnRyaWdnZXJBbGxBbmltYXRpb25FbmRFdmVudCgkY29udGFpbmVyLCBcInNzLm9uU3RhcnRFbmQgc3Mub25Qcm9ncmVzc0VuZCBzcy5vbkVuZEVuZFwiKTtcclxuXHJcbiAgICAgICAgICAgIC8qKiBCaW5kIGFsbCBvZiB0aGUgZXZlbnQgaGFuZGxlcnMgb24gdGhlIGNvbnRhaW5lciwgbm90IGFuY2hvcnMgKi9cclxuICAgICAgICAgICAgYmluZEV2ZW50SGFuZGxlcnMoJGNvbnRhaW5lcik7XHJcblxyXG4gICAgICAgICAgICAvKiogUHVibGljIG1ldGhvZHMgKi9cclxuICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgIGhyZWY6IGN1cnJlbnRIcmVmLFxyXG4gICAgICAgICAgICAgICAgY2FjaGU6IGNhY2hlLFxyXG4gICAgICAgICAgICAgICAgbG9hZDogbG9hZCxcclxuICAgICAgICAgICAgICAgIGZldGNoOiBmZXRjaCxcclxuICAgICAgICAgICAgICAgIHRvZ2dsZUFuaW1hdGlvbkNsYXNzOiB0b2dnbGVBbmltYXRpb25DbGFzc1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0sXHJcblxyXG4gICAgICAgIC8qKiBSZXR1cm5zIGVsZW1lbnRzIHdpdGggU21vb3RoU3RhdGUgYXR0YWNoZWQgdG8gaXQgKi9cclxuICAgICAgICBkZWNsYXJlU21vb3RoU3RhdGUgPSBmdW5jdGlvbihvcHRpb25zKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmVhY2goZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBDaGVja3MgdG8gbWFrZSBzdXJlIHRoZSBzbW9vdGhTdGF0ZSBlbGVtZW50IGhhcyBhbiBpZCBhbmQgaXNuXCJ0IGFscmVhZHkgYm91bmRcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmlkICYmICEkLmRhdGEodGhpcywgXCJzbW9vdGhTdGF0ZVwiKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIE1ha2VzIHB1YmxpYyBtZXRob2RzIGF2YWlsYWJsZSB2aWEgJChcImVsZW1lbnRcIikuZGF0YShcInNtb290aFN0YXRlXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICQuZGF0YSh0aGlzLCBcInNtb290aFN0YXRlXCIsIG5ldyBTbW9vdGhTdGF0ZSh0aGlzLCBvcHRpb25zKSk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKCF0aGlzLmlkICYmIGNvbnNsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhyb3cgd2FybmluZyBpZiBpbiBkZXZlbG9wbWVudCBtb2RlXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc2wud2FybihcIkV2ZXJ5IHNtb290aFN0YXRlIGNvbnRhaW5lciBuZWVkcyBhbiBpZCBidXQgdGhlIGZvbGxvd2luZyBvbmUgZG9lcyBub3QgaGF2ZSBvbmU6XCIsIHRoaXMpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9O1xyXG5cclxuICAgIC8qKiBTZXRzIHRoZSBwb3BzdGF0ZSBmdW5jdGlvbiAgKi9cclxuICAgIHdpbmRvdy5vbnBvcHN0YXRlID0gb25Qb3BTdGF0ZTtcclxuXHJcbiAgICAvKiogTWFrZXMgdXRpbGl0eSBmdW5jdGlvbnMgcHVibGljIGZvciB1bml0IHRlc3RzICovXHJcbiAgICAkLnNtb290aFN0YXRlVXRpbGl0eSA9IHV0aWxpdHk7XHJcblxyXG4gICAgLyoqIERlZmluZXMgdGhlIHNtb290aFN0YXRlIHBsdWdpbiAqL1xyXG4gICAgJC5mbi5zbW9vdGhTdGF0ZSA9IGRlY2xhcmVTbW9vdGhTdGF0ZTtcclxuXHJcbn0pKGpRdWVyeSwgd2luZG93LCBkb2N1bWVudCk7XHJcblxyXG5mdW5jdGlvbiBhZGRQSW1hZ2VDbGFzcygpIHtcclxuICAgICQoXCJwXCIpLmhhcyhcImltZ1wiKS5hZGRDbGFzcyhcIm1hcmtkb3duLWltYWdlXCIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjYXNlU3R1ZHlIb3ZlcigpIHtcclxuICAgIHZhciBjYXNlU3R1ZHkgPSAkKFwiLmNhc2VcIik7XHJcbiAgICBjYXNlU3R1ZHkuaG92ZXIoZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgJCh0aGlzKS5hZGRDbGFzcyhcImFjdGl2ZVwiKTtcclxuICAgIH0sIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICQodGhpcykucmVtb3ZlQ2xhc3MoXCJhY3RpdmVcIik7XHJcbiAgICB9KTtcclxufVxyXG5cclxuKGZ1bmN0aW9uKCQpIHtcclxuICAgICd1c2Ugc3RyaWN0JztcclxuICAgIGNhc2VTdHVkeUhvdmVyKCk7XHJcbiAgICBhZGRQSW1hZ2VDbGFzcygpO1xyXG5cclxuICAgIHZhciAkYm9keSA9ICQoJ2h0bWwsIGJvZHknKSxcclxuICAgICAgICBjb250ZW50ID0gJCgnI3NzLXdyYXBwZXInKS5zbW9vdGhTdGF0ZSh7XHJcbiAgICAgICAgICAgIHByZWZldGNoOiB0cnVlLFxyXG4gICAgICAgICAgICBwYWdlQ2FjaGVTaXplOiA0LFxyXG4gICAgICAgICAgICBvblN0YXJ0OiB7XHJcbiAgICAgICAgICAgICAgICBkdXJhdGlvbjogMjUwLFxyXG4gICAgICAgICAgICAgICAgcmVuZGVyOiBmdW5jdGlvbih1cmwsICRjb250YWluZXIpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250ZW50LnRvZ2dsZUFuaW1hdGlvbkNsYXNzKCdpcy1leGl0aW5nJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgJGJvZHkuYW5pbWF0ZSh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjcm9sbFRvcDogMFxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBjYWxsYmFjazogZnVuY3Rpb24odXJsLCAkY29udGFpbmVyLCAkY29udGVudCkge1xyXG4gICAgICAgICAgICAgICAgY2FzZVN0dWR5SG92ZXIoKTtcclxuICAgICAgICAgICAgICAgIGFkZFBJbWFnZUNsYXNzKCk7XHJcblxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSkuZGF0YSgnc21vb3RoU3RhdGUnKTtcclxuXHJcbn0pKGpRdWVyeSk7Il0sInNvdXJjZVJvb3QiOiIvc291cmNlLyJ9