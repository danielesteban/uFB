LIB = {
	setLang : function(lang) {
		L = LANG[lang];
		L.lang = lang;
		window.localStorage && localStorage.setItem('lang', lang);
	},
	getParams : function(url) {
		var params = {};
		url.substr(url.indexOf('?') + 1).split('&').forEach(function(param) {
			param = param.split('=');
			params[param[0]] = param[1];
		});
		return params;
	},
	renderSkin : function() {
		/* Render the layout */
		$('body').hide().empty().append(Handlebars.templates.skin({year: (new Date()).getFullYear()}));
	},
	FBLogin : function() {
		FB.login(function(response) {
			if(!response.authResponse) return;
			LIB.FBLoginCallback(response.authResponse);
		}, {scope: 'read_stream,manage_notifications'});
	},
	FBLoginCallback : function(authResponse) {
		FB.api('/me', function(user) {
			$('header div.user').html(Handlebars.partials.user(user));
		});
		LIB.update();
	},
	logout : function() {
		FB.logout(function() {
			window.localStorage && localStorage.clear();
			document.location.reload();
		});
	},
	getPosts : function() {
		var since = parseInt(localStorage.getItem('since'), 10) - 3600,
			params = { limit: 500 };

		since > 0 && (params.since = since);
		$('section').html('<p class="updating">' + L.updating + '...</p>');
		FB.api('/me/home', 'get', params, function(r) {
			var noData = {
					ids : [],
					indexes : []
				},
				store = function() {
					/* process, parse and store the data */
					var l = r.data.length,
						storedPosts = window.localStorage ? (JSON.parse(localStorage.getItem('posts')) || []) : [],
						addedPosts = [];

					for(var x=0; x<l; x++) {
						var p = r.data[x];
						if(p.error || storedPosts.indexOf(p.id) !== -1) {
							r.data.splice(x, 1);
							x--;
							l--;
						} else {
							/* Picture url extraction */
							if(p.picture) {
								(p.picture.indexOf('https://fbcdn-photos') === 0 || p.picture.indexOf('https://fbcdn-vthumb') === 0 || p.picture.indexOf('https://fbcdn-profile') === 0) && p.picture.indexOf('?') === -1 && (p.picture = p.picture.substr(0, p.picture.length - 5) + 'n' + p.picture.substr(p.picture.length - 4));
								if(p.picture.indexOf('https://fbexternal') === 0) {
									var params = LIB.getParams(p.picture);
									params.url && (p.picture = decodeURIComponent(params.url));
									params.src && (p.picture = decodeURIComponent(params.src));
								}
							}
							/* Embeded content */
							if(p.link) {
								(p.link.indexOf('http://soundcloud.com') === 0 || p.link.indexOf('https://soundcloud.com') === 0) && (p.soundcloud = true);
								if(p.link.indexOf('http://www.youtube.com') === 0 || p.link.indexOf('https://www.youtube.com') === 0) {
									var params = LIB.getParams(p.link);
									params.v && (p.youtube = params.v);
								}
								(p.link.indexOf('http://youtu.be/') === 0 || p.link.indexOf('https://youtu.be/') === 0) && (p.youtube = p.link.substr(p.link.lastIndexOf('/') + 1));
							}

							/* store post on localStorage */
							if(!window.localStorage) continue;
							var data = { from : p.from };
							p.message && (data.message = p.message);
							p.name && (data.name = p.name);
							p.description && (data.description = p.description);
							p.picture && (data.picture = p.picture);
							p.link && (data.link = p.link);
							p.soundcloud && (data.soundcloud = p.soundcloud);
							p.youtube && (data.youtube = p.youtube);
							p.comments && (data.comments = p.comments);
							p.actions && (data.actions = p.actions);
							localStorage.setItem('post:' + p.id, JSON.stringify(data));
							addedPosts.push(p.id);
						}
					}
					/* store posts index on localStorage */
					addedPosts.length && localStorage.setItem('posts', JSON.stringify(addedPosts.concat(storedPosts)));
					
					/* store since date on localStorage */
					if(window.localStorage && r.paging && r.paging.previous) {
						var params = LIB.getParams(r.paging.previous);
						params.since && (localStorage.setItem('since', parseInt(params.since, 10)));	
					}

					LIB.renderPosts();
				};

			r.data.forEach(function(p, i) {
				//check for posts with missing data
				if(p.message || p.picture || p.link) return;
				noData.ids.push(p.id);
				noData.indexes.push(i);
			});

			if(!noData.ids.length) return store();
			FB.api('/?ids=' + noData.ids.join(','), function(data) {
				noData.ids.forEach(function(id, i) {
					i = noData.indexes[i];
					if(data[id]) r.data[i] = data[id];
					else r.data[i].error = true;
				});
				store();
			});
		});
	},
	renderPosts : function() {
		//render inital posts set
		var posts = window.localStorage ? (JSON.parse(localStorage.getItem('posts')) || []) : [],
			w = $(window),
			doc = $(document),
			pageSize = 10,
			postIndex = pageSize;
		
		postIndex >= posts.length && (postIndex = posts.length - 1);
		$('section').empty();
		for(var x=0; x<postIndex; x++) $('section').append(Handlebars.partials.post(JSON.parse(localStorage.getItem('post:' + posts[x]))));

		//get previous content on scroll
		var setBrs = function() {
				$('div.data p.message').each(function(i, p) {
					p = $(p);
					$('br', p).length === 0 && p.html(p.text().replace(/\n/g, '<br>'));
					//TODO: parse links
				});
			},
			onScroll = function() {
				var bt = (doc.height() - w.height()) * 0.8;
				if(bt < 200 || w.scrollTop() > bt) {
					if(postIndex >= posts.length -1) return w.unbind('scroll', onScroll);
					var to = postIndex + pageSize;
					to >= posts.length && (to = posts.length - 1);
					for(var x=postIndex; x<to; x++) {
						$('section').append(Handlebars.partials.post(JSON.parse(localStorage.getItem('post:' + posts[x]))));
					}
					setBrs();
					postIndex = to;
				}
			};

		w.bind('scroll', onScroll);
		setBrs();
	},
	getNotifications : function() {
		FB.api('/me/notifications', function(r) {
			var n = $('header div.user a.notifications');
			if(r.summary.unseen_count) n.text(r.summary.unseen_count).show();
			else n.hide();
			n = $('header div.user div.notifications');
			if(r.data.length) {
				n.empty();
				r.data.forEach(function(d) {
					n.append(Handlebars.partials.notification(d));
				});
			} else n.hide();
			window.document.title = (r.summary.unseen_count ? '(' + r.summary.unseen_count + ') ' : '') + 'µFB';
		});
	},
	clickNotification : function(e) {
		var li = $(e.target).parents('li').first(),
			n = $('header div.user a.notifications'),
			c = parseInt(n.text(), 10) - 1;

		if(c > 0) n.text(c);
		else n.hide();
		li.fadeOut('fast', function() {
			li.hide();
			$('header div.user div.notifications li').length === 0 && $('header div.user div.notifications').hide();
		});
	},
	update : function() {
		LIB.getPosts();
		setTimeout(function() {
			LIB.getNotifications();
		}, 0);
	}
};

/* AppCache handler */
window.applicationCache && window.applicationCache.addEventListener('updateready', function(e) {
	if(window.applicationCache.status !== window.applicationCache.UPDATEREADY) return;
	try {
		window.applicationCache.swapCache();
	} catch(e) {}
	window.location.reload();
}, false);

$(window).load(function() {
	/* Handlebars helpers */
	Handlebars.registerHelper('L', function(id) {
		return L[id] || id;
	});

	/* Lang detection/setup */
	var browser_lang = navigator.language ? navigator.language.split('-') : [navigator.browserLanguage],
		cookie_lang = window.localStorage ? localStorage.getItem('lang') : false,
		available_langs = ['en', 'es'],
		lang = 'en'; //the default

	if(available_langs.indexOf(cookie_lang) !== -1) lang = cookie_lang;    
	else if(available_langs.indexOf(browser_lang[0].toLowerCase()) !== -1) lang = browser_lang[0].toLowerCase();
	else if(browser_lang[1] && available_langs.indexOf(browser_lang[1].toLowerCase()) !== -1) lang = browser_lang[1].toLowerCase();
	LIB.setLang(lang);
	
	/* Render the skin */
	LIB.renderSkin();

	/* onResize handler */
	var onResize = function() {
			$('section').css('minHeight', $(window).height() - 88);
		};

	onResize();
	$(window).resize(onResize);

	/* Init FB */
	$('body').append('<div id="fb-root"></div>');
	window.fbAsyncInit = function() {
		FB.init({
			appId : window.location.host.indexOf('localhost') !== -1 ? '505280316231529' : '587851521263817'
		});
		FB.getLoginStatus(function(response){
			if(!response.authResponse) $('section').html(Handlebars.templates.unauth());
			else LIB.FBLoginCallback(response.authResponse); 
			$('body').fadeIn('fast');
	    });
	};
	$.getScript('//connect.facebook.net/' + (L.lang === 'es' ? 'es_ES' : 'en_US') + '/all.js');
});
