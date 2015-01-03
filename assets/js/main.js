function caseStudyHover(){var t=$(".case");t.hover(function(){$(this).addClass("active")},function(){$(this).removeClass("active")})}!function(t,n,e){"use strict";var o=t("html, body"),a=n.console||!1,r={anchors:"a",prefetch:!1,blacklist:".no-smoothstate, [target]",development:!1,pageCacheSize:0,alterRequestUrl:function(t){return t},onStart:{duration:0,render:function(){o.scrollTop(0)}},onProgress:{duration:0,render:function(){o.css("cursor","wait"),o.find("a").css("cursor","wait")}},onEnd:{duration:0,render:function(t,n,e){o.css("cursor","auto"),o.find("a").css("cursor","auto"),n.html(e)}},callback:function(){}},i={isExternal:function(t){var e=t.match(/^([^:\/?#]+:)?(?:\/\/([^\/?#]*))?([^?#]+)?(\?[^#]*)?(#.*)?/);return"string"==typeof e[1]&&e[1].length>0&&e[1].toLowerCase()!==n.location.protocol?!0:"string"==typeof e[2]&&e[2].length>0&&e[2].replace(new RegExp(":("+{"http:":80,"https:":443}[n.location.protocol]+")?$"),"")!==n.location.host?!0:!1},isHash:function(t){var e=t.indexOf(n.location.pathname)>0?!0:!1,o=t.indexOf("#")>0?!0:!1;return e&&o?!0:!1},shouldLoad:function(t,n){var e=t.prop("href");return!i.isExternal(e)&&!i.isHash(e)&&!t.is(n)},htmlDoc:function(n){var e,o=t(),a=/<(\/?)(html|head|body|title|base|meta)(\s+[^>]*)?>/gi,r="ss"+Math.round(1e5*Math.random()),i=n.replace(a,function(n,e,a,i){var s={};return e||(o=o.add("<"+a+"/>"),i&&t.each(t("<div"+i+"/>")[0].attributes,function(t,n){s[n.name]=n.value}),o.eq(-1).attr(s)),"<"+e+"div"+(e?"":" id='"+r+(o.length-1)+"'")+">"});return o.length?(e||(e=t("<div/>")),e.html(i),t.each(o,function(t){var n=e.find("#"+r+t).before(o[t]);o.eq(t).html(n.contents()),n.remove()}),e.children().unwrap()):t(n)},clearIfOverCapacity:function(t,n){return Object.keys||(Object.keys=function(t){var n,e=[];for(n in t)Object.prototype.hasOwnProperty.call(t,n)&&e.push(n);return e}),Object.keys(t).length>n&&(t={}),t},getContentById:function(n,e){e=e instanceof jQuery?e:i.htmlDoc(e);var o=e.find(n),a=o.length?t.trim(o.html()):e.filter(n).html(),r=a.length?t(a):null;return r},storePageIn:function(t,n,e){return e=e instanceof jQuery?e:i.htmlDoc(e),t[n]={status:"loaded",title:e.find("title").text(),html:e},t},triggerAllAnimationEndEvent:function(n,e){e=" "+e||"";var o=0,a="animationstart webkitAnimationStart oanimationstart MSAnimationStart",r="animationend webkitAnimationEnd oanimationend MSAnimationEnd",s="allanimationend",c=function(e){t(e.delegateTarget).is(n)&&(e.stopPropagation(),o++)},u=function(e){t(e.delegateTarget).is(n)&&(e.stopPropagation(),o--,0===o&&n.trigger(s))};n.on(a,c),n.on(r,u),n.on("allanimationend"+e,function(){o=0,i.redraw(n)})},redraw:function(t){t.height(0),setTimeout(function(){t.height("auto")},0)}},s=function(e){if(null!==e.state){var o=n.location.href,a=t("#"+e.state.id),r=a.data("smoothState");r.href===o||i.isHash(o)||r.load(o,!0)}},c=function(o,s){var c=t(o),u={},l=n.location.href,d=function(t,e){e=e||!1;var o=!1,a=!1,r={loaded:function(){var r=o?"ss.onProgressEnd":"ss.onStartEnd";a&&o?a&&h(t):c.one(r,function(){h(t)}),e||n.history.pushState({id:c.prop("id")},u[t].title,t)},fetching:function(){o||(o=!0,c.one("ss.onStartEnd",function(){s.onProgress.render(t,c,null),setTimeout(function(){c.trigger("ss.onProgressEnd"),a=!0},s.onStart.duration)})),setTimeout(function(){u.hasOwnProperty(t)&&r[u[t].status]()},10)},error:function(){n.location=t}};u.hasOwnProperty(t)||f(t),s.onStart.render(t,c,null),setTimeout(function(){c.trigger("ss.onStartEnd")},s.onStart.duration),r[u[t].status]()},h=function(t){var o="#"+c.prop("id"),r=u[t]?i.getContentById(o,u[t].html):null;r?(e.title=u[t].title,c.data("smoothState").href=t,s.onEnd.render(t,c,r),c.one("ss.onEndEnd",function(){s.callback(t,c,r)}),setTimeout(function(){c.trigger("ss.onEndEnd")},s.onEnd.duration)):!r&&s.development&&a?a.warn("No element with an id of "+o+" in response from "+t+" in "+u):n.location=t},f=function(n){if(!u.hasOwnProperty(n)){u=i.clearIfOverCapacity(u,s.pageCacheSize),u[n]={status:"fetching"};var e=s.alterRequestUrl(n)||n,o=t.ajax(e);o.success(function(t){i.storePageIn(u,n,t),c.data("smoothState").cache=u}),o.error(function(){u[n].status="error"})}},m=function(n){var e=t(n.currentTarget),o=e.prop("href");i.shouldLoad(e,s.blacklist)&&(n.stopPropagation(),f(o))},p=function(n){var e=t(n.currentTarget),o=e.prop("href");n.metaKey||n.ctrlKey||!i.shouldLoad(e,s.blacklist)||(n.stopPropagation(),n.preventDefault(),d(o))},g=function(t){t.on("click",s.anchors,p),s.prefetch&&t.on("mouseover touchstart",s.anchors,m)},v=function(t){var n=c.addClass(t).prop("class");c.removeClass(n),setTimeout(function(){c.addClass(n)},0),c.one("ss.onStartEnd ss.onProgressEnd ss.onEndEnd",function(){c.removeClass(t)})};return s=t.extend(r,s),null===n.history.state&&n.history.replaceState({id:c.prop("id")},e.title,l),i.storePageIn(u,l,e.documentElement.outerHTML),i.triggerAllAnimationEndEvent(c,"ss.onStartEnd ss.onProgressEnd ss.onEndEnd"),g(c),{href:l,cache:u,load:d,fetch:f,toggleAnimationClass:v}},u=function(n){return this.each(function(){this.id&&!t.data(this,"smoothState")?t.data(this,"smoothState",new c(this,n)):!this.id&&a&&a.warn("Every smoothState container needs an id but the following one does not have one:",this)})};n.onpopstate=s,t.smoothStateUtility=i,t.fn.smoothState=u}(jQuery,window,document),caseStudyHover(),function(t){"use strict";var n=t("html, body"),e=t("#ss-wrapper").smoothState({prefetch:!0,pageCacheSize:4,onStart:{duration:250,render:function(){e.toggleAnimationClass("is-exiting"),n.animate({scrollTop:0})}},callback:function(){caseStudyHover()}}).data("smoothState")}(jQuery);