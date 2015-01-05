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
 ;(function ( $, window, document, undefined ) {
    "use strict";

    var
    /** Used later to scroll page to the top */
    $body       = $("html, body"),

    /** Used in development mode to console out useful warnings */
    consl       = (window.console || false),

    /** Plugin default options */
    defaults    = {

        /** jquery element string to specify which anchors smoothstate should bind to */
        anchors : "a",

        /** If set to true, smoothState will prefetch a link's contents on hover */
        prefetch : false,

        /** A selecor that deinfes with links should be ignored by smoothState */
        blacklist : ".no-smoothstate, [target]",

        /** If set to true, smoothState will log useful debug information instead of aborting */
        development : false,

        /** The number of pages smoothState will try to store in memory and not request again */
        pageCacheSize : 0,

        /** A function that can be used to alter urls before they are used to request content */
        alterRequestUrl : function (url) {
            return url;
        },

        /** Run when a link has been activated */
        onStart : {
            duration: 0,
            render: function (url, $container) {
                $body.scrollTop(0);
            }
        },

        /** Run if the page request is still pending and onStart has finished animating */
        onProgress : {
            duration: 0,
            render: function (url, $container) {
                $body.css("cursor", "wait");
                $body.find("a").css("cursor", "wait");
            }
        },

        /** Run when requested content is ready to be injected into the page  */
        onEnd : {
            duration: 0,
            render: function (url, $container, $content) {
                $body.css("cursor", "auto");
                $body.find("a").css("cursor", "auto");
                $container.html($content);
            }
        },

        /** Run when content has been injected and all animations are complete  */
        callback : function(url, $container, $content) {

        }
    },

    /** Utility functions that are decoupled from SmoothState */
    utility     = {

            /**
             * Checks to see if the url is external
             * @param   {string}    url - url being evaluated
             * @see     http://stackoverflow.com/questions/6238351/fastest-way-to-detect-external-urls
             *
             */
             isExternal: function (url) {
                var match = url.match(/^([^:\/?#]+:)?(?:\/\/([^\/?#]*))?([^?#]+)?(\?[^#]*)?(#.*)?/);
                if (typeof match[1] === "string" && match[1].length > 0 && match[1].toLowerCase() !== window.location.protocol) {
                    return true;
                }
                if (typeof match[2] === "string" && match[2].length > 0 && match[2].replace(new RegExp(":(" + {"http:": 80, "https:": 443}[window.location.protocol] + ")?$"), "") !== window.location.host) {
                    return true;
                }
                return false;
            },

            /**
             * Checks to see if the url is an internal hash
             * @param   {string}    url - url being evaluated
             *
             */
             isHash: function (url) {
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
             shouldLoad: function ($anchor, blacklist) {
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
             htmlDoc: function (html) {
                var parent,
                elems       = $(),
                matchTag    = /<(\/?)(html|head|body|title|base|meta)(\s+[^>]*)?>/ig,
                prefix      = "ss" + Math.round(Math.random() * 100000),
                htmlParsed  = html.replace(matchTag, function(tag, slash, name, attrs) {
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
             clearIfOverCapacity: function (obj, cap) {
                // Polyfill Object.keys if it doesn"t exist
                if (!Object.keys) {
                    Object.keys = function (obj) {
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
             getContentById: function (id, $html) {
                $html = ($html instanceof jQuery) ? $html : utility.htmlDoc($html);
                var $insideElem         = $html.find(id),
                updatedContainer    = ($insideElem.length) ? $.trim($insideElem.html()) : $html.filter(id).html(),
                newContent          = (updatedContainer.length) ? $(updatedContainer) : null;
                return newContent;
            },

            /**
             * Stores html content as jquery object in given object
             * @param   {object}    object - object contents will be stored into
             * @param   {string}    url - url to be used as the prop
             * @param   {jquery}    html - contents to store
             *
             */
             storePageIn: function (object, url, $html) {
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
             triggerAllAnimationEndEvent: function ($element, resetOn) {

                resetOn = " " + resetOn || "";

                var animationCount      = 0,
                animationstart      = "animationstart webkitAnimationStart oanimationstart MSAnimationStart",
                animationend        = "animationend webkitAnimationEnd oanimationend MSAnimationEnd",
                eventname           = "allanimationend",
                onAnimationStart    = function (e) {
                    if ($(e.delegateTarget).is($element)) {
                        e.stopPropagation();
                        animationCount ++;
                    }
                },
                onAnimationEnd      = function (e) {
                    if ($(e.delegateTarget).is($element)) {
                        e.stopPropagation();
                        animationCount --;
                        if(animationCount === 0) {
                            $element.trigger(eventname);
                        }
                    }
                };

                $element.on(animationstart, onAnimationStart);
                $element.on(animationend, onAnimationEnd);

                $element.on("allanimationend" + resetOn, function(){
                    animationCount = 0;
                    utility.redraw($element);
                });
            },

            /** Forces browser to redraw elements */
            redraw: function ($element) {
                $element.height(0);
                setTimeout(function(){$element.height("auto");}, 0);
            }
        },

        /** Handles the popstate event, like when the user hits "back" */
        onPopState = function ( e ) {
            if(e.state !== null) {
                var url     = window.location.href,
                $page   = $("#" + e.state.id),
                page    = $page.data("smoothState");

                if(page.href !== url && !utility.isHash(url)) {
                    page.load(url, true);
                }
            }
        },

        /** Constructor function */
        SmoothState = function ( element, options ) {
            var
            /** Container element smoothState is run on */
            $container  = $(element),

            /** Variable that stores pages after they are requested */
            cache       = {},

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
                 load = function (url, isPopped) {

                    /** Makes this an optional variable by setting a default */
                    isPopped = isPopped || false;

                    var
                    /** Used to check if the onProgress function has been run */
                    hasRunCallback  = false,

                    callbBackEnded  = false,

                    /** List of responses for the states of the page request */
                    responses       = {

                        /** Page is ready, update the content */
                        loaded: function() {
                            var eventName = hasRunCallback ? "ss.onProgressEnd" : "ss.onStartEnd";

                            if(!callbBackEnded || !hasRunCallback) {
                                $container.one(eventName, function(){
                                    updateContent(url);
                                });
                            } else if(callbBackEnded) {
                                updateContent(url);
                            }

                            if(!isPopped) {
                                window.history.pushState({ id: $container.prop("id") }, cache[url].title, url);
                            }
                        },

                        /** Loading, wait 10 ms and check again */
                        fetching: function() {

                            if(!hasRunCallback) {

                                hasRunCallback = true;

                                    // Run the onProgress callback and set trigger
                                    $container.one("ss.onStartEnd", function(){
                                        options.onProgress.render(url, $container, null);

                                        setTimeout(function(){
                                            $container.trigger("ss.onProgressEnd");
                                            callbBackEnded = true;
                                        }, options.onStart.duration);

                                    });
                                }

                                setTimeout(function () {
                                    // Might of been canceled, better check!
                                    if(cache.hasOwnProperty(url)){
                                        responses[cache[url].status]();
                                    }
                                }, 10);
                            },

                            /** Error, abort and redirect */
                            error: function(){
                                window.location = url;
                            }
                        };

                        if (!cache.hasOwnProperty(url)) {
                            fetch(url);
                        }

                    // Run the onStart callback and set trigger
                    options.onStart.render(url, $container, null);
                    setTimeout(function(){
                        $container.trigger("ss.onStartEnd");
                    }, options.onStart.duration);

                    // Start checking for the status of content
                    responses[cache[url].status]();

                },

                /** Updates the contents from cache[url] */
                updateContent = function (url) {
                    // If the content has been requested and is done:
                    var containerId = "#" + $container.prop("id"),
                    $content    = cache[url] ? utility.getContentById(containerId, cache[url].html) : null;

                    if($content) {
                        document.title = cache[url].title;
                        $container.data("smoothState").href = url;

                        // Call the onEnd callback and set trigger
                        options.onEnd.render(url, $container, $content);

                        $container.one("ss.onEndEnd", function(){
                            options.callback(url, $container, $content);
                        });

                        setTimeout(function(){
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
                 fetch = function (url) {

                    // Don"t fetch we have the content already
                    if(cache.hasOwnProperty(url)) {
                        return;
                    }

                    cache = utility.clearIfOverCapacity(cache, options.pageCacheSize);

                    cache[url] = { status: "fetching" };

                    var requestUrl  = options.alterRequestUrl(url) || url,
                    request     = $.ajax(requestUrl);

                    // Store contents in cache variable if successful
                    request.success(function (html) {
                        // Clear cache varible if it"s getting too big
                        utility.storePageIn(cache, url, html);
                        $container.data("smoothState").cache = cache;
                    });

                    // Mark as error
                    request.error(function () {
                        cache[url].status = "error";
                    });
                },
                /**
                 * Binds to the hover event of a link, used for prefetching content
                 *
                 * @param   {object}    event
                 *
                 */
                 hoverAnchor = function (event) {
                    var $anchor = $(event.currentTarget),
                    url     = $anchor.prop("href");
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
                 clickAnchor = function (event) {
                    var $anchor     = $(event.currentTarget),
                    url         = $anchor.prop("href");

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
                 bindEventHandlers = function ($element) {
                    //@todo: Handle form submissions
                    $element.on("click", options.anchors, clickAnchor);

                    if (options.prefetch) {
                        $element.on("mouseover touchstart", options.anchors, hoverAnchor);
                    }

                },

                /** Used to restart css animations with a class */
                toggleAnimationClass = function (classname) {
                    var classes = $container.addClass(classname).prop("class");

                    $container.removeClass(classes);

                    setTimeout(function(){
                        $container.addClass(classes);
                    },0);

                    $container.one("ss.onStartEnd ss.onProgressEnd ss.onEndEnd", function(){
                        $container.removeClass(classname);
                    });

                };

                /** Override defaults with options passed in */
                options = $.extend(defaults, options);

                /** Sets a default state */
                if(window.history.state === null) {
                    window.history.replaceState({ id: $container.prop("id") }, document.title, currentHref);
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
            declareSmoothState = function ( options ) {
                return this.each(function () {
                // Checks to make sure the smoothState element has an id and isn"t already bound
                if(this.id && !$.data(this, "smoothState")) {
                    // Makes public methods available via $("element").data("smoothState");
                    $.data(this, "smoothState", new SmoothState(this, options));
                } else if (!this.id && consl) {
                    // Throw warning if in development mode
                    consl.warn("Every smoothState container needs an id but the following one does not have one:", this);
                }
            });
            };

            /** Sets the popstate function */
            window.onpopstate = onPopState;

            /** Makes utility functions public for unit tests */
            $.smoothStateUtility = utility;

            /** Defines the smoothState plugin */
            $.fn.smoothState = declareSmoothState;

        })(jQuery, window, document);

        function caseStudyHover(){
            var caseStudy = $(".case");
            caseStudy.hover( function() {
                $( this ).addClass( "active" );
            }, function(){
                $( this ).removeClass( "active" );
            });
        }

        ;(function ($) {
            'use strict';
            caseStudyHover();

            var $body = $('html, body'),
                content   = $('#ss-wrapper').smoothState({
                prefetch: true,
                pageCacheSize: 4,
                onStart: {
                    duration: 250,
                    render: function (url, $container) {
                        content.toggleAnimationClass('is-exiting');
                        $body.animate({
                            scrollTop: 0
                        });
                    }
                },
                callback: function (url, $container, $content) {
                    caseStudyHover();
                }
            }).data('smoothState');

        })(jQuery);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsIm5hbWVzIjpbXSwibWFwcGluZ3MiOiIiLCJzb3VyY2VzIjpbIm1haW4uanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcbiAqIHNtb290aFN0YXRlLmpzIGlzIGEgalF1ZXJ5IHBsdWdpbiB0byBzdG9wIHBhZ2UgbG9hZCBqYW5rLlxyXG4gKlxyXG4gKiBUaGlzIGpRdWVyeSBwbHVnaW4gcHJvZ3Jlc3NpdmVseSBlbmhhbmNlcyBwYWdlIGxvYWRzIHRvXHJcbiAqIGJlaGF2ZSBtb3JlIGxpa2UgYSBzaW5nbGUtcGFnZSBhcHBsaWNhdGlvbi5cclxuICpcclxuICogQGF1dGhvciAgTWlndWVsIMOBbmdlbCBQw6lyZXogICByZWFjaG1lQG1pZ3VlbC1wZXJlei5jb21cclxuICogQHNlZSAgICAgaHR0cHM6Ly9naXRodWIuY29tL21pZ3VlbC1wZXJlei9qcXVlcnkuc21vb3RoU3RhdGUuanNcclxuICpcclxuICovXHJcbiA7KGZ1bmN0aW9uICggJCwgd2luZG93LCBkb2N1bWVudCwgdW5kZWZpbmVkICkge1xyXG4gICAgXCJ1c2Ugc3RyaWN0XCI7XHJcblxyXG4gICAgdmFyXHJcbiAgICAvKiogVXNlZCBsYXRlciB0byBzY3JvbGwgcGFnZSB0byB0aGUgdG9wICovXHJcbiAgICAkYm9keSAgICAgICA9ICQoXCJodG1sLCBib2R5XCIpLFxyXG5cclxuICAgIC8qKiBVc2VkIGluIGRldmVsb3BtZW50IG1vZGUgdG8gY29uc29sZSBvdXQgdXNlZnVsIHdhcm5pbmdzICovXHJcbiAgICBjb25zbCAgICAgICA9ICh3aW5kb3cuY29uc29sZSB8fCBmYWxzZSksXHJcblxyXG4gICAgLyoqIFBsdWdpbiBkZWZhdWx0IG9wdGlvbnMgKi9cclxuICAgIGRlZmF1bHRzICAgID0ge1xyXG5cclxuICAgICAgICAvKioganF1ZXJ5IGVsZW1lbnQgc3RyaW5nIHRvIHNwZWNpZnkgd2hpY2ggYW5jaG9ycyBzbW9vdGhzdGF0ZSBzaG91bGQgYmluZCB0byAqL1xyXG4gICAgICAgIGFuY2hvcnMgOiBcImFcIixcclxuXHJcbiAgICAgICAgLyoqIElmIHNldCB0byB0cnVlLCBzbW9vdGhTdGF0ZSB3aWxsIHByZWZldGNoIGEgbGluaydzIGNvbnRlbnRzIG9uIGhvdmVyICovXHJcbiAgICAgICAgcHJlZmV0Y2ggOiBmYWxzZSxcclxuXHJcbiAgICAgICAgLyoqIEEgc2VsZWNvciB0aGF0IGRlaW5mZXMgd2l0aCBsaW5rcyBzaG91bGQgYmUgaWdub3JlZCBieSBzbW9vdGhTdGF0ZSAqL1xyXG4gICAgICAgIGJsYWNrbGlzdCA6IFwiLm5vLXNtb290aHN0YXRlLCBbdGFyZ2V0XVwiLFxyXG5cclxuICAgICAgICAvKiogSWYgc2V0IHRvIHRydWUsIHNtb290aFN0YXRlIHdpbGwgbG9nIHVzZWZ1bCBkZWJ1ZyBpbmZvcm1hdGlvbiBpbnN0ZWFkIG9mIGFib3J0aW5nICovXHJcbiAgICAgICAgZGV2ZWxvcG1lbnQgOiBmYWxzZSxcclxuXHJcbiAgICAgICAgLyoqIFRoZSBudW1iZXIgb2YgcGFnZXMgc21vb3RoU3RhdGUgd2lsbCB0cnkgdG8gc3RvcmUgaW4gbWVtb3J5IGFuZCBub3QgcmVxdWVzdCBhZ2FpbiAqL1xyXG4gICAgICAgIHBhZ2VDYWNoZVNpemUgOiAwLFxyXG5cclxuICAgICAgICAvKiogQSBmdW5jdGlvbiB0aGF0IGNhbiBiZSB1c2VkIHRvIGFsdGVyIHVybHMgYmVmb3JlIHRoZXkgYXJlIHVzZWQgdG8gcmVxdWVzdCBjb250ZW50ICovXHJcbiAgICAgICAgYWx0ZXJSZXF1ZXN0VXJsIDogZnVuY3Rpb24gKHVybCkge1xyXG4gICAgICAgICAgICByZXR1cm4gdXJsO1xyXG4gICAgICAgIH0sXHJcblxyXG4gICAgICAgIC8qKiBSdW4gd2hlbiBhIGxpbmsgaGFzIGJlZW4gYWN0aXZhdGVkICovXHJcbiAgICAgICAgb25TdGFydCA6IHtcclxuICAgICAgICAgICAgZHVyYXRpb246IDAsXHJcbiAgICAgICAgICAgIHJlbmRlcjogZnVuY3Rpb24gKHVybCwgJGNvbnRhaW5lcikge1xyXG4gICAgICAgICAgICAgICAgJGJvZHkuc2Nyb2xsVG9wKDApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgLyoqIFJ1biBpZiB0aGUgcGFnZSByZXF1ZXN0IGlzIHN0aWxsIHBlbmRpbmcgYW5kIG9uU3RhcnQgaGFzIGZpbmlzaGVkIGFuaW1hdGluZyAqL1xyXG4gICAgICAgIG9uUHJvZ3Jlc3MgOiB7XHJcbiAgICAgICAgICAgIGR1cmF0aW9uOiAwLFxyXG4gICAgICAgICAgICByZW5kZXI6IGZ1bmN0aW9uICh1cmwsICRjb250YWluZXIpIHtcclxuICAgICAgICAgICAgICAgICRib2R5LmNzcyhcImN1cnNvclwiLCBcIndhaXRcIik7XHJcbiAgICAgICAgICAgICAgICAkYm9keS5maW5kKFwiYVwiKS5jc3MoXCJjdXJzb3JcIiwgXCJ3YWl0XCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgLyoqIFJ1biB3aGVuIHJlcXVlc3RlZCBjb250ZW50IGlzIHJlYWR5IHRvIGJlIGluamVjdGVkIGludG8gdGhlIHBhZ2UgICovXHJcbiAgICAgICAgb25FbmQgOiB7XHJcbiAgICAgICAgICAgIGR1cmF0aW9uOiAwLFxyXG4gICAgICAgICAgICByZW5kZXI6IGZ1bmN0aW9uICh1cmwsICRjb250YWluZXIsICRjb250ZW50KSB7XHJcbiAgICAgICAgICAgICAgICAkYm9keS5jc3MoXCJjdXJzb3JcIiwgXCJhdXRvXCIpO1xyXG4gICAgICAgICAgICAgICAgJGJvZHkuZmluZChcImFcIikuY3NzKFwiY3Vyc29yXCIsIFwiYXV0b1wiKTtcclxuICAgICAgICAgICAgICAgICRjb250YWluZXIuaHRtbCgkY29udGVudCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG5cclxuICAgICAgICAvKiogUnVuIHdoZW4gY29udGVudCBoYXMgYmVlbiBpbmplY3RlZCBhbmQgYWxsIGFuaW1hdGlvbnMgYXJlIGNvbXBsZXRlICAqL1xyXG4gICAgICAgIGNhbGxiYWNrIDogZnVuY3Rpb24odXJsLCAkY29udGFpbmVyLCAkY29udGVudCkge1xyXG5cclxuICAgICAgICB9XHJcbiAgICB9LFxyXG5cclxuICAgIC8qKiBVdGlsaXR5IGZ1bmN0aW9ucyB0aGF0IGFyZSBkZWNvdXBsZWQgZnJvbSBTbW9vdGhTdGF0ZSAqL1xyXG4gICAgdXRpbGl0eSAgICAgPSB7XHJcblxyXG4gICAgICAgICAgICAvKipcclxuICAgICAgICAgICAgICogQ2hlY2tzIHRvIHNlZSBpZiB0aGUgdXJsIGlzIGV4dGVybmFsXHJcbiAgICAgICAgICAgICAqIEBwYXJhbSAgIHtzdHJpbmd9ICAgIHVybCAtIHVybCBiZWluZyBldmFsdWF0ZWRcclxuICAgICAgICAgICAgICogQHNlZSAgICAgaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy82MjM4MzUxL2Zhc3Rlc3Qtd2F5LXRvLWRldGVjdC1leHRlcm5hbC11cmxzXHJcbiAgICAgICAgICAgICAqXHJcbiAgICAgICAgICAgICAqL1xyXG4gICAgICAgICAgICAgaXNFeHRlcm5hbDogZnVuY3Rpb24gKHVybCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIG1hdGNoID0gdXJsLm1hdGNoKC9eKFteOlxcLz8jXSs6KT8oPzpcXC9cXC8oW15cXC8/I10qKSk/KFtePyNdKyk/KFxcP1teI10qKT8oIy4qKT8vKTtcclxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgbWF0Y2hbMV0gPT09IFwic3RyaW5nXCIgJiYgbWF0Y2hbMV0ubGVuZ3RoID4gMCAmJiBtYXRjaFsxXS50b0xvd2VyQ2FzZSgpICE9PSB3aW5kb3cubG9jYXRpb24ucHJvdG9jb2wpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgbWF0Y2hbMl0gPT09IFwic3RyaW5nXCIgJiYgbWF0Y2hbMl0ubGVuZ3RoID4gMCAmJiBtYXRjaFsyXS5yZXBsYWNlKG5ldyBSZWdFeHAoXCI6KFwiICsge1wiaHR0cDpcIjogODAsIFwiaHR0cHM6XCI6IDQ0M31bd2luZG93LmxvY2F0aW9uLnByb3RvY29sXSArIFwiKT8kXCIpLCBcIlwiKSAhPT0gd2luZG93LmxvY2F0aW9uLmhvc3QpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgfSxcclxuXHJcbiAgICAgICAgICAgIC8qKlxyXG4gICAgICAgICAgICAgKiBDaGVja3MgdG8gc2VlIGlmIHRoZSB1cmwgaXMgYW4gaW50ZXJuYWwgaGFzaFxyXG4gICAgICAgICAgICAgKiBAcGFyYW0gICB7c3RyaW5nfSAgICB1cmwgLSB1cmwgYmVpbmcgZXZhbHVhdGVkXHJcbiAgICAgICAgICAgICAqXHJcbiAgICAgICAgICAgICAqL1xyXG4gICAgICAgICAgICAgaXNIYXNoOiBmdW5jdGlvbiAodXJsKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgaGFzUGF0aG5hbWUgPSAodXJsLmluZGV4T2Yod2luZG93LmxvY2F0aW9uLnBhdGhuYW1lKSA+IDApID8gdHJ1ZSA6IGZhbHNlLFxyXG4gICAgICAgICAgICAgICAgaGFzSGFzaCA9ICh1cmwuaW5kZXhPZihcIiNcIikgPiAwKSA/IHRydWUgOiBmYWxzZTtcclxuICAgICAgICAgICAgICAgIHJldHVybiAoaGFzUGF0aG5hbWUgJiYgaGFzSGFzaCkgPyB0cnVlIDogZmFsc2U7XHJcbiAgICAgICAgICAgIH0sXHJcblxyXG4gICAgICAgICAgICAvKipcclxuICAgICAgICAgICAgICogQ2hlY2tzIHRvIHNlZSBpZiB3ZSBzaG91bGQgYmUgbG9hZGluZyB0aGlzIFVSTFxyXG4gICAgICAgICAgICAgKiBAcGFyYW0gICB7c3RyaW5nfSAgICB1cmwgLSB1cmwgYmVpbmcgZXZhbHVhdGVkXHJcbiAgICAgICAgICAgICAqIEBwYXJhbSAgIHtzdHJpbmd9ICAgIGJsYWNrbGlzdCAtIGpxdWVyeSBzZWxlY3RvclxyXG4gICAgICAgICAgICAgKlxyXG4gICAgICAgICAgICAgKi9cclxuICAgICAgICAgICAgIHNob3VsZExvYWQ6IGZ1bmN0aW9uICgkYW5jaG9yLCBibGFja2xpc3QpIHtcclxuICAgICAgICAgICAgICAgIHZhciB1cmwgPSAkYW5jaG9yLnByb3AoXCJocmVmXCIpO1xyXG4gICAgICAgICAgICAgICAgLy8gVVJMIHdpbGwgb25seSBiZSBsb2FkZWQgaWYgaXRcInMgbm90IGFuIGV4dGVybmFsIGxpbmssIGhhc2gsIG9yIGJsYWNrbGlzdGVkXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gKCF1dGlsaXR5LmlzRXh0ZXJuYWwodXJsKSAmJiAhdXRpbGl0eS5pc0hhc2godXJsKSAmJiAhJGFuY2hvci5pcyhibGFja2xpc3QpKTtcclxuICAgICAgICAgICAgfSxcclxuXHJcbiAgICAgICAgICAgIC8qKlxyXG4gICAgICAgICAgICAgKiBQcmV2ZW50cyBqUXVlcnkgZnJvbSBzdHJpcHBpbmcgZWxlbWVudHMgZnJvbSAkKGh0bWwpXHJcbiAgICAgICAgICAgICAqIEBwYXJhbSAgIHtzdHJpbmd9ICAgIHVybCAtIHVybCBiZWluZyBldmFsdWF0ZWRcclxuICAgICAgICAgICAgICogQGF1dGhvciAgQmVuIEFsbWFuICAgaHR0cDovL2JlbmFsbWFuLmNvbS9cclxuICAgICAgICAgICAgICogQHNlZSAgICAgaHR0cHM6Ly9naXN0LmdpdGh1Yi5jb20vY293Ym95Lzc0Mjk1MlxyXG4gICAgICAgICAgICAgKlxyXG4gICAgICAgICAgICAgKi9cclxuICAgICAgICAgICAgIGh0bWxEb2M6IGZ1bmN0aW9uIChodG1sKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgcGFyZW50LFxyXG4gICAgICAgICAgICAgICAgZWxlbXMgICAgICAgPSAkKCksXHJcbiAgICAgICAgICAgICAgICBtYXRjaFRhZyAgICA9IC88KFxcLz8pKGh0bWx8aGVhZHxib2R5fHRpdGxlfGJhc2V8bWV0YSkoXFxzK1tePl0qKT8+L2lnLFxyXG4gICAgICAgICAgICAgICAgcHJlZml4ICAgICAgPSBcInNzXCIgKyBNYXRoLnJvdW5kKE1hdGgucmFuZG9tKCkgKiAxMDAwMDApLFxyXG4gICAgICAgICAgICAgICAgaHRtbFBhcnNlZCAgPSBodG1sLnJlcGxhY2UobWF0Y2hUYWcsIGZ1bmN0aW9uKHRhZywgc2xhc2gsIG5hbWUsIGF0dHJzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIG9iaiA9IHt9O1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICghc2xhc2gpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZWxlbXMgPSBlbGVtcy5hZGQoXCI8XCIgKyBuYW1lICsgXCIvPlwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGF0dHJzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAkLmVhY2goJChcIjxkaXZcIiArIGF0dHJzICsgXCIvPlwiKVswXS5hdHRyaWJ1dGVzLCBmdW5jdGlvbihpLCBhdHRyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb2JqW2F0dHIubmFtZV0gPSBhdHRyLnZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgZWxlbXMuZXEoLTEpLmF0dHIob2JqKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiPFwiICsgc2xhc2ggKyBcImRpdlwiICsgKHNsYXNoID8gXCJcIiA6IFwiIGlkPSdcIiArIHByZWZpeCArIChlbGVtcy5sZW5ndGggLSAxKSArIFwiJ1wiKSArIFwiPlwiO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gSWYgbm8gcGxhY2Vob2xkZXIgZWxlbWVudHMgd2VyZSBuZWNlc3NhcnksIGp1c3QgcmV0dXJuIG5vcm1hbFxyXG4gICAgICAgICAgICAgICAgLy8galF1ZXJ5LXBhcnNlZCBIVE1MLlxyXG4gICAgICAgICAgICAgICAgaWYgKCFlbGVtcy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gJChodG1sKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIC8vIENyZWF0ZSBwYXJlbnQgbm9kZSBpZiBpdCBoYXNuXCJ0IGJlZW4gY3JlYXRlZCB5ZXQuXHJcbiAgICAgICAgICAgICAgICBpZiAoIXBhcmVudCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudCA9ICQoXCI8ZGl2Lz5cIik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAvLyBDcmVhdGUgdGhlIHBhcmVudCBub2RlIGFuZCBhcHBlbmQgdGhlIHBhcnNlZCwgcGxhY2UtaGVsZCBIVE1MLlxyXG4gICAgICAgICAgICAgICAgcGFyZW50Lmh0bWwoaHRtbFBhcnNlZCk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gUmVwbGFjZSBlYWNoIHBsYWNlaG9sZGVyIGVsZW1lbnQgd2l0aCBpdHMgaW50ZW5kZWQgZWxlbWVudC5cclxuICAgICAgICAgICAgICAgICQuZWFjaChlbGVtcywgZnVuY3Rpb24oaSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBlbGVtID0gcGFyZW50LmZpbmQoXCIjXCIgKyBwcmVmaXggKyBpKS5iZWZvcmUoZWxlbXNbaV0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGVsZW1zLmVxKGkpLmh0bWwoZWxlbS5jb250ZW50cygpKTtcclxuICAgICAgICAgICAgICAgICAgICBlbGVtLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHBhcmVudC5jaGlsZHJlbigpLnVud3JhcCgpO1xyXG4gICAgICAgICAgICB9LFxyXG5cclxuICAgICAgICAgICAgLyoqXHJcbiAgICAgICAgICAgICAqIFJlc2V0cyBhbiBvYmplY3QgaWYgaXQgaGFzIHRvbyBtYW55IHByb3BlcnRpZXNcclxuICAgICAgICAgICAgICpcclxuICAgICAgICAgICAgICogVGhpcyBpcyB1c2VkIHRvIGNsZWFyIHRoZSBcImNhY2hlXCIgb2JqZWN0IHRoYXQgc3RvcmVzXHJcbiAgICAgICAgICAgICAqIGFsbCBvZiB0aGUgaHRtbC4gVGhpcyB3b3VsZCBwcmV2ZW50IHRoZSBjbGllbnQgZnJvbVxyXG4gICAgICAgICAgICAgKiBydW5uaW5nIG91dCBvZiBtZW1vcnkgYW5kIGFsbG93IHRoZSB1c2VyIHRvIGhpdCB0aGVcclxuICAgICAgICAgICAgICogc2VydmVyIGZvciBhIGZyZXNoIGNvcHkgb2YgdGhlIGNvbnRlbnQuXHJcbiAgICAgICAgICAgICAqXHJcbiAgICAgICAgICAgICAqIEBwYXJhbSAgIHtvYmplY3R9ICAgIG9ialxyXG4gICAgICAgICAgICAgKiBAcGFyYW0gICB7bnVtYmVyfSAgICBjYXBcclxuICAgICAgICAgICAgICpcclxuICAgICAgICAgICAgICovXHJcbiAgICAgICAgICAgICBjbGVhcklmT3ZlckNhcGFjaXR5OiBmdW5jdGlvbiAob2JqLCBjYXApIHtcclxuICAgICAgICAgICAgICAgIC8vIFBvbHlmaWxsIE9iamVjdC5rZXlzIGlmIGl0IGRvZXNuXCJ0IGV4aXN0XHJcbiAgICAgICAgICAgICAgICBpZiAoIU9iamVjdC5rZXlzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgT2JqZWN0LmtleXMgPSBmdW5jdGlvbiAob2JqKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBrZXlzID0gW10sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGs7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoayBpbiBvYmopIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGtleXMucHVzaChrKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ga2V5cztcclxuICAgICAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGlmIChPYmplY3Qua2V5cyhvYmopLmxlbmd0aCA+IGNhcCkge1xyXG4gICAgICAgICAgICAgICAgICAgIG9iaiA9IHt9O1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIHJldHVybiBvYmo7XHJcbiAgICAgICAgICAgIH0sXHJcblxyXG4gICAgICAgICAgICAvKipcclxuICAgICAgICAgICAgICogRmluZHMgdGhlIGlubmVyIGNvbnRlbnQgb2YgYW4gZWxlbWVudCwgYnkgYW4gSUQsIGZyb20gYSBqUXVlcnkgb2JqZWN0XHJcbiAgICAgICAgICAgICAqIEBwYXJhbSAgIHtzdHJpbmd9ICAgIGlkXHJcbiAgICAgICAgICAgICAqIEBwYXJhbSAgIHtvYmplY3R9ICAgICRodG1sXHJcbiAgICAgICAgICAgICAqXHJcbiAgICAgICAgICAgICAqL1xyXG4gICAgICAgICAgICAgZ2V0Q29udGVudEJ5SWQ6IGZ1bmN0aW9uIChpZCwgJGh0bWwpIHtcclxuICAgICAgICAgICAgICAgICRodG1sID0gKCRodG1sIGluc3RhbmNlb2YgalF1ZXJ5KSA/ICRodG1sIDogdXRpbGl0eS5odG1sRG9jKCRodG1sKTtcclxuICAgICAgICAgICAgICAgIHZhciAkaW5zaWRlRWxlbSAgICAgICAgID0gJGh0bWwuZmluZChpZCksXHJcbiAgICAgICAgICAgICAgICB1cGRhdGVkQ29udGFpbmVyICAgID0gKCRpbnNpZGVFbGVtLmxlbmd0aCkgPyAkLnRyaW0oJGluc2lkZUVsZW0uaHRtbCgpKSA6ICRodG1sLmZpbHRlcihpZCkuaHRtbCgpLFxyXG4gICAgICAgICAgICAgICAgbmV3Q29udGVudCAgICAgICAgICA9ICh1cGRhdGVkQ29udGFpbmVyLmxlbmd0aCkgPyAkKHVwZGF0ZWRDb250YWluZXIpIDogbnVsbDtcclxuICAgICAgICAgICAgICAgIHJldHVybiBuZXdDb250ZW50O1xyXG4gICAgICAgICAgICB9LFxyXG5cclxuICAgICAgICAgICAgLyoqXHJcbiAgICAgICAgICAgICAqIFN0b3JlcyBodG1sIGNvbnRlbnQgYXMganF1ZXJ5IG9iamVjdCBpbiBnaXZlbiBvYmplY3RcclxuICAgICAgICAgICAgICogQHBhcmFtICAge29iamVjdH0gICAgb2JqZWN0IC0gb2JqZWN0IGNvbnRlbnRzIHdpbGwgYmUgc3RvcmVkIGludG9cclxuICAgICAgICAgICAgICogQHBhcmFtICAge3N0cmluZ30gICAgdXJsIC0gdXJsIHRvIGJlIHVzZWQgYXMgdGhlIHByb3BcclxuICAgICAgICAgICAgICogQHBhcmFtICAge2pxdWVyeX0gICAgaHRtbCAtIGNvbnRlbnRzIHRvIHN0b3JlXHJcbiAgICAgICAgICAgICAqXHJcbiAgICAgICAgICAgICAqL1xyXG4gICAgICAgICAgICAgc3RvcmVQYWdlSW46IGZ1bmN0aW9uIChvYmplY3QsIHVybCwgJGh0bWwpIHtcclxuICAgICAgICAgICAgICAgICRodG1sID0gKCRodG1sIGluc3RhbmNlb2YgalF1ZXJ5KSA/ICRodG1sIDogdXRpbGl0eS5odG1sRG9jKCRodG1sKTtcclxuICAgICAgICAgICAgICAgIG9iamVjdFt1cmxdID0geyAvLyBDb250ZW50IGlzIGluZGV4ZWQgYnkgdGhlIHVybFxyXG4gICAgICAgICAgICAgICAgICAgIHN0YXR1czogXCJsb2FkZWRcIixcclxuICAgICAgICAgICAgICAgICAgICB0aXRsZTogJGh0bWwuZmluZChcInRpdGxlXCIpLnRleHQoKSwgLy8gU3RvcmVzIHRoZSB0aXRsZSBvZiB0aGUgcGFnZVxyXG4gICAgICAgICAgICAgICAgICAgIGh0bWw6ICRodG1sIC8vIFN0b3JlcyB0aGUgY29udGVudHMgb2YgdGhlIHBhZ2VcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gb2JqZWN0O1xyXG4gICAgICAgICAgICB9LFxyXG5cclxuICAgICAgICAgICAgLyoqXHJcbiAgICAgICAgICAgICAqIFRyaWdnZXJzIGFuIFwiYWxsYW5pbWF0aW9uZW5kXCIgZXZlbnQgd2hlbiBhbGwgYW5pbWF0aW9ucyBhcmUgY29tcGxldGVcclxuICAgICAgICAgICAgICogQHBhcmFtICAge29iamVjdH0gICAgJGVsZW1lbnQgLSBqUXVlcnkgb2JqZWN0IHRoYXQgc2hvdWxkIHRyaWdnZXIgZXZlbnRcclxuICAgICAgICAgICAgICogQHBhcmFtICAge3N0cmluZ30gICAgcmVzZXRPbiAtIHdoaWNoIG90aGVyIGV2ZW50cyB0byB0cmlnZ2VyIGFsbGFuaW1hdGlvbmVuZCBvblxyXG4gICAgICAgICAgICAgKlxyXG4gICAgICAgICAgICAgKi9cclxuICAgICAgICAgICAgIHRyaWdnZXJBbGxBbmltYXRpb25FbmRFdmVudDogZnVuY3Rpb24gKCRlbGVtZW50LCByZXNldE9uKSB7XHJcblxyXG4gICAgICAgICAgICAgICAgcmVzZXRPbiA9IFwiIFwiICsgcmVzZXRPbiB8fCBcIlwiO1xyXG5cclxuICAgICAgICAgICAgICAgIHZhciBhbmltYXRpb25Db3VudCAgICAgID0gMCxcclxuICAgICAgICAgICAgICAgIGFuaW1hdGlvbnN0YXJ0ICAgICAgPSBcImFuaW1hdGlvbnN0YXJ0IHdlYmtpdEFuaW1hdGlvblN0YXJ0IG9hbmltYXRpb25zdGFydCBNU0FuaW1hdGlvblN0YXJ0XCIsXHJcbiAgICAgICAgICAgICAgICBhbmltYXRpb25lbmQgICAgICAgID0gXCJhbmltYXRpb25lbmQgd2Via2l0QW5pbWF0aW9uRW5kIG9hbmltYXRpb25lbmQgTVNBbmltYXRpb25FbmRcIixcclxuICAgICAgICAgICAgICAgIGV2ZW50bmFtZSAgICAgICAgICAgPSBcImFsbGFuaW1hdGlvbmVuZFwiLFxyXG4gICAgICAgICAgICAgICAgb25BbmltYXRpb25TdGFydCAgICA9IGZ1bmN0aW9uIChlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCQoZS5kZWxlZ2F0ZVRhcmdldCkuaXMoJGVsZW1lbnQpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGFuaW1hdGlvbkNvdW50ICsrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBvbkFuaW1hdGlvbkVuZCAgICAgID0gZnVuY3Rpb24gKGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoJChlLmRlbGVnYXRlVGFyZ2V0KS5pcygkZWxlbWVudCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYW5pbWF0aW9uQ291bnQgLS07XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKGFuaW1hdGlvbkNvdW50ID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAkZWxlbWVudC50cmlnZ2VyKGV2ZW50bmFtZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgICRlbGVtZW50Lm9uKGFuaW1hdGlvbnN0YXJ0LCBvbkFuaW1hdGlvblN0YXJ0KTtcclxuICAgICAgICAgICAgICAgICRlbGVtZW50Lm9uKGFuaW1hdGlvbmVuZCwgb25BbmltYXRpb25FbmQpO1xyXG5cclxuICAgICAgICAgICAgICAgICRlbGVtZW50Lm9uKFwiYWxsYW5pbWF0aW9uZW5kXCIgKyByZXNldE9uLCBmdW5jdGlvbigpe1xyXG4gICAgICAgICAgICAgICAgICAgIGFuaW1hdGlvbkNvdW50ID0gMDtcclxuICAgICAgICAgICAgICAgICAgICB1dGlsaXR5LnJlZHJhdygkZWxlbWVudCk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSxcclxuXHJcbiAgICAgICAgICAgIC8qKiBGb3JjZXMgYnJvd3NlciB0byByZWRyYXcgZWxlbWVudHMgKi9cclxuICAgICAgICAgICAgcmVkcmF3OiBmdW5jdGlvbiAoJGVsZW1lbnQpIHtcclxuICAgICAgICAgICAgICAgICRlbGVtZW50LmhlaWdodCgwKTtcclxuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKXskZWxlbWVudC5oZWlnaHQoXCJhdXRvXCIpO30sIDApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgLyoqIEhhbmRsZXMgdGhlIHBvcHN0YXRlIGV2ZW50LCBsaWtlIHdoZW4gdGhlIHVzZXIgaGl0cyBcImJhY2tcIiAqL1xyXG4gICAgICAgIG9uUG9wU3RhdGUgPSBmdW5jdGlvbiAoIGUgKSB7XHJcbiAgICAgICAgICAgIGlmKGUuc3RhdGUgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHZhciB1cmwgICAgID0gd2luZG93LmxvY2F0aW9uLmhyZWYsXHJcbiAgICAgICAgICAgICAgICAkcGFnZSAgID0gJChcIiNcIiArIGUuc3RhdGUuaWQpLFxyXG4gICAgICAgICAgICAgICAgcGFnZSAgICA9ICRwYWdlLmRhdGEoXCJzbW9vdGhTdGF0ZVwiKTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZihwYWdlLmhyZWYgIT09IHVybCAmJiAhdXRpbGl0eS5pc0hhc2godXJsKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHBhZ2UubG9hZCh1cmwsIHRydWUpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgLyoqIENvbnN0cnVjdG9yIGZ1bmN0aW9uICovXHJcbiAgICAgICAgU21vb3RoU3RhdGUgPSBmdW5jdGlvbiAoIGVsZW1lbnQsIG9wdGlvbnMgKSB7XHJcbiAgICAgICAgICAgIHZhclxyXG4gICAgICAgICAgICAvKiogQ29udGFpbmVyIGVsZW1lbnQgc21vb3RoU3RhdGUgaXMgcnVuIG9uICovXHJcbiAgICAgICAgICAgICRjb250YWluZXIgID0gJChlbGVtZW50KSxcclxuXHJcbiAgICAgICAgICAgIC8qKiBWYXJpYWJsZSB0aGF0IHN0b3JlcyBwYWdlcyBhZnRlciB0aGV5IGFyZSByZXF1ZXN0ZWQgKi9cclxuICAgICAgICAgICAgY2FjaGUgICAgICAgPSB7fSxcclxuXHJcbiAgICAgICAgICAgIC8qKiBVcmwgb2YgdGhlIGNvbnRlbnQgdGhhdCBpcyBjdXJyZW50bHkgZGlzcGxheWVkICovXHJcbiAgICAgICAgICAgIGN1cnJlbnRIcmVmID0gd2luZG93LmxvY2F0aW9uLmhyZWYsXHJcblxyXG4gICAgICAgICAgICAgICAgLyoqXHJcbiAgICAgICAgICAgICAgICAgKiBMb2FkcyB0aGUgY29udGVudHMgb2YgYSB1cmwgaW50byBvdXIgY29udGFpbmVyXHJcbiAgICAgICAgICAgICAgICAgKlxyXG4gICAgICAgICAgICAgICAgICogQHBhcmFtICAge3N0cmluZ30gICAgdXJsXHJcbiAgICAgICAgICAgICAgICAgKiBAcGFyYW0gICB7Ym9vbH0gICAgICBpc1BvcHBlZCAtIHVzZWQgdG8gZGV0ZXJtaW5lIGlmIHdoZSBzaG91bGRcclxuICAgICAgICAgICAgICAgICAqICAgICAgICAgICAgICAgICAgICAgIGFkZCBhIG5ldyBpdGVtIGludG8gdGhlIGhpc3Rvcnkgb2JqZWN0XHJcbiAgICAgICAgICAgICAgICAgKlxyXG4gICAgICAgICAgICAgICAgICovXHJcbiAgICAgICAgICAgICAgICAgbG9hZCA9IGZ1bmN0aW9uICh1cmwsIGlzUG9wcGVkKSB7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8qKiBNYWtlcyB0aGlzIGFuIG9wdGlvbmFsIHZhcmlhYmxlIGJ5IHNldHRpbmcgYSBkZWZhdWx0ICovXHJcbiAgICAgICAgICAgICAgICAgICAgaXNQb3BwZWQgPSBpc1BvcHBlZCB8fCBmYWxzZTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgdmFyXHJcbiAgICAgICAgICAgICAgICAgICAgLyoqIFVzZWQgdG8gY2hlY2sgaWYgdGhlIG9uUHJvZ3Jlc3MgZnVuY3Rpb24gaGFzIGJlZW4gcnVuICovXHJcbiAgICAgICAgICAgICAgICAgICAgaGFzUnVuQ2FsbGJhY2sgID0gZmFsc2UsXHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGNhbGxiQmFja0VuZGVkICA9IGZhbHNlLFxyXG5cclxuICAgICAgICAgICAgICAgICAgICAvKiogTGlzdCBvZiByZXNwb25zZXMgZm9yIHRoZSBzdGF0ZXMgb2YgdGhlIHBhZ2UgcmVxdWVzdCAqL1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3BvbnNlcyAgICAgICA9IHtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8qKiBQYWdlIGlzIHJlYWR5LCB1cGRhdGUgdGhlIGNvbnRlbnQgKi9cclxuICAgICAgICAgICAgICAgICAgICAgICAgbG9hZGVkOiBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBldmVudE5hbWUgPSBoYXNSdW5DYWxsYmFjayA/IFwic3Mub25Qcm9ncmVzc0VuZFwiIDogXCJzcy5vblN0YXJ0RW5kXCI7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYoIWNhbGxiQmFja0VuZGVkIHx8ICFoYXNSdW5DYWxsYmFjaykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICRjb250YWluZXIub25lKGV2ZW50TmFtZSwgZnVuY3Rpb24oKXtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlQ29udGVudCh1cmwpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmKGNhbGxiQmFja0VuZGVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlQ29udGVudCh1cmwpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKCFpc1BvcHBlZCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdpbmRvdy5oaXN0b3J5LnB1c2hTdGF0ZSh7IGlkOiAkY29udGFpbmVyLnByb3AoXCJpZFwiKSB9LCBjYWNoZVt1cmxdLnRpdGxlLCB1cmwpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgLyoqIExvYWRpbmcsIHdhaXQgMTAgbXMgYW5kIGNoZWNrIGFnYWluICovXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZldGNoaW5nOiBmdW5jdGlvbigpIHtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZighaGFzUnVuQ2FsbGJhY2spIHtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGFzUnVuQ2FsbGJhY2sgPSB0cnVlO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gUnVuIHRoZSBvblByb2dyZXNzIGNhbGxiYWNrIGFuZCBzZXQgdHJpZ2dlclxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAkY29udGFpbmVyLm9uZShcInNzLm9uU3RhcnRFbmRcIiwgZnVuY3Rpb24oKXtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMub25Qcm9ncmVzcy5yZW5kZXIodXJsLCAkY29udGFpbmVyLCBudWxsKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJGNvbnRhaW5lci50cmlnZ2VyKFwic3Mub25Qcm9ncmVzc0VuZFwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsYkJhY2tFbmRlZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LCBvcHRpb25zLm9uU3RhcnQuZHVyYXRpb24pO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gTWlnaHQgb2YgYmVlbiBjYW5jZWxlZCwgYmV0dGVyIGNoZWNrIVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZihjYWNoZS5oYXNPd25Qcm9wZXJ0eSh1cmwpKXtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3BvbnNlc1tjYWNoZVt1cmxdLnN0YXR1c10oKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sIDEwKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLyoqIEVycm9yLCBhYm9ydCBhbmQgcmVkaXJlY3QgKi9cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yOiBmdW5jdGlvbigpe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbiA9IHVybDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghY2FjaGUuaGFzT3duUHJvcGVydHkodXJsKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZmV0Y2godXJsKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAvLyBSdW4gdGhlIG9uU3RhcnQgY2FsbGJhY2sgYW5kIHNldCB0cmlnZ2VyXHJcbiAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy5vblN0YXJ0LnJlbmRlcih1cmwsICRjb250YWluZXIsIG51bGwpO1xyXG4gICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJGNvbnRhaW5lci50cmlnZ2VyKFwic3Mub25TdGFydEVuZFwiKTtcclxuICAgICAgICAgICAgICAgICAgICB9LCBvcHRpb25zLm9uU3RhcnQuZHVyYXRpb24pO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAvLyBTdGFydCBjaGVja2luZyBmb3IgdGhlIHN0YXR1cyBvZiBjb250ZW50XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzcG9uc2VzW2NhY2hlW3VybF0uc3RhdHVzXSgpO1xyXG5cclxuICAgICAgICAgICAgICAgIH0sXHJcblxyXG4gICAgICAgICAgICAgICAgLyoqIFVwZGF0ZXMgdGhlIGNvbnRlbnRzIGZyb20gY2FjaGVbdXJsXSAqL1xyXG4gICAgICAgICAgICAgICAgdXBkYXRlQ29udGVudCA9IGZ1bmN0aW9uICh1cmwpIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBJZiB0aGUgY29udGVudCBoYXMgYmVlbiByZXF1ZXN0ZWQgYW5kIGlzIGRvbmU6XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNvbnRhaW5lcklkID0gXCIjXCIgKyAkY29udGFpbmVyLnByb3AoXCJpZFwiKSxcclxuICAgICAgICAgICAgICAgICAgICAkY29udGVudCAgICA9IGNhY2hlW3VybF0gPyB1dGlsaXR5LmdldENvbnRlbnRCeUlkKGNvbnRhaW5lcklkLCBjYWNoZVt1cmxdLmh0bWwpIDogbnVsbDtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgaWYoJGNvbnRlbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQudGl0bGUgPSBjYWNoZVt1cmxdLnRpdGxlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAkY29udGFpbmVyLmRhdGEoXCJzbW9vdGhTdGF0ZVwiKS5ocmVmID0gdXJsO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ2FsbCB0aGUgb25FbmQgY2FsbGJhY2sgYW5kIHNldCB0cmlnZ2VyXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnMub25FbmQucmVuZGVyKHVybCwgJGNvbnRhaW5lciwgJGNvbnRlbnQpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgJGNvbnRhaW5lci5vbmUoXCJzcy5vbkVuZEVuZFwiLCBmdW5jdGlvbigpe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy5jYWxsYmFjayh1cmwsICRjb250YWluZXIsICRjb250ZW50KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAkY29udGFpbmVyLnRyaWdnZXIoXCJzcy5vbkVuZEVuZFwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSwgb3B0aW9ucy5vbkVuZC5kdXJhdGlvbik7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoISRjb250ZW50ICYmIG9wdGlvbnMuZGV2ZWxvcG1lbnQgJiYgY29uc2wpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGhyb3cgd2FybmluZyB0byBoZWxwIGRlYnVnIGluIGRldmVsb3BtZW50IG1vZGVcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc2wud2FybihcIk5vIGVsZW1lbnQgd2l0aCBhbiBpZCBvZiBcIiArIGNvbnRhaW5lcklkICsgXCIgaW4gcmVzcG9uc2UgZnJvbSBcIiArIHVybCArIFwiIGluIFwiICsgY2FjaGUpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIE5vIGNvbnRlbnQgYXZhaWxibGUgdG8gdXBkYXRlIHdpdGgsIGFib3J0aW5nLi4uXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbiA9IHVybDtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9LFxyXG5cclxuICAgICAgICAgICAgICAgIC8qKlxyXG4gICAgICAgICAgICAgICAgICogRmV0Y2hlcyB0aGUgY29udGVudHMgb2YgYSB1cmwgYW5kIHN0b3JlcyBpdCBpbiB0aGUgXCJjYWNoZVwiIHZhcmlibGVcclxuICAgICAgICAgICAgICAgICAqIEBwYXJhbSAgIHtzdHJpbmd9ICAgIHVybFxyXG4gICAgICAgICAgICAgICAgICpcclxuICAgICAgICAgICAgICAgICAqL1xyXG4gICAgICAgICAgICAgICAgIGZldGNoID0gZnVuY3Rpb24gKHVybCkge1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAvLyBEb25cInQgZmV0Y2ggd2UgaGF2ZSB0aGUgY29udGVudCBhbHJlYWR5XHJcbiAgICAgICAgICAgICAgICAgICAgaWYoY2FjaGUuaGFzT3duUHJvcGVydHkodXJsKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICBjYWNoZSA9IHV0aWxpdHkuY2xlYXJJZk92ZXJDYXBhY2l0eShjYWNoZSwgb3B0aW9ucy5wYWdlQ2FjaGVTaXplKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgY2FjaGVbdXJsXSA9IHsgc3RhdHVzOiBcImZldGNoaW5nXCIgfTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHJlcXVlc3RVcmwgID0gb3B0aW9ucy5hbHRlclJlcXVlc3RVcmwodXJsKSB8fCB1cmwsXHJcbiAgICAgICAgICAgICAgICAgICAgcmVxdWVzdCAgICAgPSAkLmFqYXgocmVxdWVzdFVybCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIFN0b3JlIGNvbnRlbnRzIGluIGNhY2hlIHZhcmlhYmxlIGlmIHN1Y2Nlc3NmdWxcclxuICAgICAgICAgICAgICAgICAgICByZXF1ZXN0LnN1Y2Nlc3MoZnVuY3Rpb24gKGh0bWwpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ2xlYXIgY2FjaGUgdmFyaWJsZSBpZiBpdFwicyBnZXR0aW5nIHRvbyBiaWdcclxuICAgICAgICAgICAgICAgICAgICAgICAgdXRpbGl0eS5zdG9yZVBhZ2VJbihjYWNoZSwgdXJsLCBodG1sKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJGNvbnRhaW5lci5kYXRhKFwic21vb3RoU3RhdGVcIikuY2FjaGUgPSBjYWNoZTtcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gTWFyayBhcyBlcnJvclxyXG4gICAgICAgICAgICAgICAgICAgIHJlcXVlc3QuZXJyb3IoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjYWNoZVt1cmxdLnN0YXR1cyA9IFwiZXJyb3JcIjtcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAvKipcclxuICAgICAgICAgICAgICAgICAqIEJpbmRzIHRvIHRoZSBob3ZlciBldmVudCBvZiBhIGxpbmssIHVzZWQgZm9yIHByZWZldGNoaW5nIGNvbnRlbnRcclxuICAgICAgICAgICAgICAgICAqXHJcbiAgICAgICAgICAgICAgICAgKiBAcGFyYW0gICB7b2JqZWN0fSAgICBldmVudFxyXG4gICAgICAgICAgICAgICAgICpcclxuICAgICAgICAgICAgICAgICAqL1xyXG4gICAgICAgICAgICAgICAgIGhvdmVyQW5jaG9yID0gZnVuY3Rpb24gKGV2ZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyICRhbmNob3IgPSAkKGV2ZW50LmN1cnJlbnRUYXJnZXQpLFxyXG4gICAgICAgICAgICAgICAgICAgIHVybCAgICAgPSAkYW5jaG9yLnByb3AoXCJocmVmXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh1dGlsaXR5LnNob3VsZExvYWQoJGFuY2hvciwgb3B0aW9ucy5ibGFja2xpc3QpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBmZXRjaCh1cmwpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0sXHJcblxyXG4gICAgICAgICAgICAgICAgLyoqXHJcbiAgICAgICAgICAgICAgICAgKiBCaW5kcyB0byB0aGUgY2xpY2sgZXZlbnQgb2YgYSBsaW5rLCB1c2VkIHRvIHNob3cgdGhlIGNvbnRlbnRcclxuICAgICAgICAgICAgICAgICAqXHJcbiAgICAgICAgICAgICAgICAgKiBAcGFyYW0gICB7b2JqZWN0fSAgICBldmVudFxyXG4gICAgICAgICAgICAgICAgICpcclxuICAgICAgICAgICAgICAgICAqL1xyXG4gICAgICAgICAgICAgICAgIGNsaWNrQW5jaG9yID0gZnVuY3Rpb24gKGV2ZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyICRhbmNob3IgICAgID0gJChldmVudC5jdXJyZW50VGFyZ2V0KSxcclxuICAgICAgICAgICAgICAgICAgICB1cmwgICAgICAgICA9ICRhbmNob3IucHJvcChcImhyZWZcIik7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIEN0cmwgKG9yIENtZCkgKyBjbGljayBtdXN0IG9wZW4gYSBuZXcgdGFiXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFldmVudC5tZXRhS2V5ICYmICFldmVudC5jdHJsS2V5ICYmIHV0aWxpdHkuc2hvdWxkTG9hZCgkYW5jaG9yLCBvcHRpb25zLmJsYWNrbGlzdCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gc3RvcFByb3BhZ2F0aW9uIHNvIHRoYXQgZXZlbnQgZG9lc25cInQgZmlyZSBvbiBwYXJlbnQgY29udGFpbmVycy5cclxuICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxvYWQodXJsKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9LFxyXG5cclxuICAgICAgICAgICAgICAgIC8qKlxyXG4gICAgICAgICAgICAgICAgICogQmluZHMgYWxsIGV2ZW50cyBhbmQgaW5pdHMgZnVuY3Rpb25hbGl0eVxyXG4gICAgICAgICAgICAgICAgICpcclxuICAgICAgICAgICAgICAgICAqIEBwYXJhbSAgIHtvYmplY3R9ICAgIGV2ZW50XHJcbiAgICAgICAgICAgICAgICAgKlxyXG4gICAgICAgICAgICAgICAgICovXHJcbiAgICAgICAgICAgICAgICAgYmluZEV2ZW50SGFuZGxlcnMgPSBmdW5jdGlvbiAoJGVsZW1lbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICAvL0B0b2RvOiBIYW5kbGUgZm9ybSBzdWJtaXNzaW9uc1xyXG4gICAgICAgICAgICAgICAgICAgICRlbGVtZW50Lm9uKFwiY2xpY2tcIiwgb3B0aW9ucy5hbmNob3JzLCBjbGlja0FuY2hvcik7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLnByZWZldGNoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICRlbGVtZW50Lm9uKFwibW91c2VvdmVyIHRvdWNoc3RhcnRcIiwgb3B0aW9ucy5hbmNob3JzLCBob3ZlckFuY2hvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIH0sXHJcblxyXG4gICAgICAgICAgICAgICAgLyoqIFVzZWQgdG8gcmVzdGFydCBjc3MgYW5pbWF0aW9ucyB3aXRoIGEgY2xhc3MgKi9cclxuICAgICAgICAgICAgICAgIHRvZ2dsZUFuaW1hdGlvbkNsYXNzID0gZnVuY3Rpb24gKGNsYXNzbmFtZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBjbGFzc2VzID0gJGNvbnRhaW5lci5hZGRDbGFzcyhjbGFzc25hbWUpLnByb3AoXCJjbGFzc1wiKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgJGNvbnRhaW5lci5yZW1vdmVDbGFzcyhjbGFzc2VzKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAkY29udGFpbmVyLmFkZENsYXNzKGNsYXNzZXMpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0sMCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICRjb250YWluZXIub25lKFwic3Mub25TdGFydEVuZCBzcy5vblByb2dyZXNzRW5kIHNzLm9uRW5kRW5kXCIsIGZ1bmN0aW9uKCl7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICRjb250YWluZXIucmVtb3ZlQ2xhc3MoY2xhc3NuYW1lKTtcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgICAgIC8qKiBPdmVycmlkZSBkZWZhdWx0cyB3aXRoIG9wdGlvbnMgcGFzc2VkIGluICovXHJcbiAgICAgICAgICAgICAgICBvcHRpb25zID0gJC5leHRlbmQoZGVmYXVsdHMsIG9wdGlvbnMpO1xyXG5cclxuICAgICAgICAgICAgICAgIC8qKiBTZXRzIGEgZGVmYXVsdCBzdGF0ZSAqL1xyXG4gICAgICAgICAgICAgICAgaWYod2luZG93Lmhpc3Rvcnkuc3RhdGUgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICB3aW5kb3cuaGlzdG9yeS5yZXBsYWNlU3RhdGUoeyBpZDogJGNvbnRhaW5lci5wcm9wKFwiaWRcIikgfSwgZG9jdW1lbnQudGl0bGUsIGN1cnJlbnRIcmVmKTtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAvKiogU3RvcmVzIHRoZSBjdXJyZW50IHBhZ2UgaW4gY2FjaGUgdmFyaWFibGUgKi9cclxuICAgICAgICAgICAgICAgIHV0aWxpdHkuc3RvcmVQYWdlSW4oY2FjaGUsIGN1cnJlbnRIcmVmLCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQub3V0ZXJIVE1MKTtcclxuXHJcbiAgICAgICAgICAgICAgICAvKiogQmluZCBhbGwgb2YgdGhlIGV2ZW50IGhhbmRsZXJzIG9uIHRoZSBjb250YWluZXIsIG5vdCBhbmNob3JzICovXHJcbiAgICAgICAgICAgICAgICB1dGlsaXR5LnRyaWdnZXJBbGxBbmltYXRpb25FbmRFdmVudCgkY29udGFpbmVyLCBcInNzLm9uU3RhcnRFbmQgc3Mub25Qcm9ncmVzc0VuZCBzcy5vbkVuZEVuZFwiKTtcclxuXHJcbiAgICAgICAgICAgICAgICAvKiogQmluZCBhbGwgb2YgdGhlIGV2ZW50IGhhbmRsZXJzIG9uIHRoZSBjb250YWluZXIsIG5vdCBhbmNob3JzICovXHJcbiAgICAgICAgICAgICAgICBiaW5kRXZlbnRIYW5kbGVycygkY29udGFpbmVyKTtcclxuXHJcbiAgICAgICAgICAgICAgICAvKiogUHVibGljIG1ldGhvZHMgKi9cclxuICAgICAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaHJlZjogY3VycmVudEhyZWYsXHJcbiAgICAgICAgICAgICAgICAgICAgY2FjaGU6IGNhY2hlLFxyXG4gICAgICAgICAgICAgICAgICAgIGxvYWQ6IGxvYWQsXHJcbiAgICAgICAgICAgICAgICAgICAgZmV0Y2g6IGZldGNoLFxyXG4gICAgICAgICAgICAgICAgICAgIHRvZ2dsZUFuaW1hdGlvbkNsYXNzOiB0b2dnbGVBbmltYXRpb25DbGFzc1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfSxcclxuXHJcbiAgICAgICAgICAgIC8qKiBSZXR1cm5zIGVsZW1lbnRzIHdpdGggU21vb3RoU3RhdGUgYXR0YWNoZWQgdG8gaXQgKi9cclxuICAgICAgICAgICAgZGVjbGFyZVNtb290aFN0YXRlID0gZnVuY3Rpb24gKCBvcHRpb25zICkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZWFjaChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBDaGVja3MgdG8gbWFrZSBzdXJlIHRoZSBzbW9vdGhTdGF0ZSBlbGVtZW50IGhhcyBhbiBpZCBhbmQgaXNuXCJ0IGFscmVhZHkgYm91bmRcclxuICAgICAgICAgICAgICAgIGlmKHRoaXMuaWQgJiYgISQuZGF0YSh0aGlzLCBcInNtb290aFN0YXRlXCIpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gTWFrZXMgcHVibGljIG1ldGhvZHMgYXZhaWxhYmxlIHZpYSAkKFwiZWxlbWVudFwiKS5kYXRhKFwic21vb3RoU3RhdGVcIik7XHJcbiAgICAgICAgICAgICAgICAgICAgJC5kYXRhKHRoaXMsIFwic21vb3RoU3RhdGVcIiwgbmV3IFNtb290aFN0YXRlKHRoaXMsIG9wdGlvbnMpKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIXRoaXMuaWQgJiYgY29uc2wpIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBUaHJvdyB3YXJuaW5nIGlmIGluIGRldmVsb3BtZW50IG1vZGVcclxuICAgICAgICAgICAgICAgICAgICBjb25zbC53YXJuKFwiRXZlcnkgc21vb3RoU3RhdGUgY29udGFpbmVyIG5lZWRzIGFuIGlkIGJ1dCB0aGUgZm9sbG93aW5nIG9uZSBkb2VzIG5vdCBoYXZlIG9uZTpcIiwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgLyoqIFNldHMgdGhlIHBvcHN0YXRlIGZ1bmN0aW9uICovXHJcbiAgICAgICAgICAgIHdpbmRvdy5vbnBvcHN0YXRlID0gb25Qb3BTdGF0ZTtcclxuXHJcbiAgICAgICAgICAgIC8qKiBNYWtlcyB1dGlsaXR5IGZ1bmN0aW9ucyBwdWJsaWMgZm9yIHVuaXQgdGVzdHMgKi9cclxuICAgICAgICAgICAgJC5zbW9vdGhTdGF0ZVV0aWxpdHkgPSB1dGlsaXR5O1xyXG5cclxuICAgICAgICAgICAgLyoqIERlZmluZXMgdGhlIHNtb290aFN0YXRlIHBsdWdpbiAqL1xyXG4gICAgICAgICAgICAkLmZuLnNtb290aFN0YXRlID0gZGVjbGFyZVNtb290aFN0YXRlO1xyXG5cclxuICAgICAgICB9KShqUXVlcnksIHdpbmRvdywgZG9jdW1lbnQpO1xyXG5cclxuICAgICAgICBmdW5jdGlvbiBjYXNlU3R1ZHlIb3Zlcigpe1xyXG4gICAgICAgICAgICB2YXIgY2FzZVN0dWR5ID0gJChcIi5jYXNlXCIpO1xyXG4gICAgICAgICAgICBjYXNlU3R1ZHkuaG92ZXIoIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICAgICAgJCggdGhpcyApLmFkZENsYXNzKCBcImFjdGl2ZVwiICk7XHJcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uKCl7XHJcbiAgICAgICAgICAgICAgICAkKCB0aGlzICkucmVtb3ZlQ2xhc3MoIFwiYWN0aXZlXCIgKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICA7KGZ1bmN0aW9uICgkKSB7XHJcbiAgICAgICAgICAgICd1c2Ugc3RyaWN0JztcclxuICAgICAgICAgICAgY2FzZVN0dWR5SG92ZXIoKTtcclxuXHJcbiAgICAgICAgICAgIHZhciAkYm9keSA9ICQoJ2h0bWwsIGJvZHknKSxcclxuICAgICAgICAgICAgICAgIGNvbnRlbnQgICA9ICQoJyNzcy13cmFwcGVyJykuc21vb3RoU3RhdGUoe1xyXG4gICAgICAgICAgICAgICAgcHJlZmV0Y2g6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBwYWdlQ2FjaGVTaXplOiA0LFxyXG4gICAgICAgICAgICAgICAgb25TdGFydDoge1xyXG4gICAgICAgICAgICAgICAgICAgIGR1cmF0aW9uOiAyNTAsXHJcbiAgICAgICAgICAgICAgICAgICAgcmVuZGVyOiBmdW5jdGlvbiAodXJsLCAkY29udGFpbmVyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRlbnQudG9nZ2xlQW5pbWF0aW9uQ2xhc3MoJ2lzLWV4aXRpbmcnKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJGJvZHkuYW5pbWF0ZSh7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzY3JvbGxUb3A6IDBcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIGNhbGxiYWNrOiBmdW5jdGlvbiAodXJsLCAkY29udGFpbmVyLCAkY29udGVudCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2VTdHVkeUhvdmVyKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pLmRhdGEoJ3Ntb290aFN0YXRlJyk7XHJcblxyXG4gICAgICAgIH0pKGpRdWVyeSk7Il0sInNvdXJjZVJvb3QiOiIvc291cmNlLyJ9