/**
 * Welcome to Pebble.js!
 *
 * This is where you write your app.
 */

var UI = require('ui');
var Vector2 = require('vector2');
var ajax = require('ajax');

/**
 * Required settings
 */
var appid = "9254B7E6E8C5A75819B74A6D9";

/**
 * UI Color Elements
 */
var colors = {
    trimetBlue: "#084C8D",
    trimetOrange: "#EE5917",
    trimetWhite: "#FFFFFF",
    trimetBlack: "#000000",
    trimetGrey: "#404040",
};

var transit_colors = {
    orange: '#D25D13',
    yellow: '#FFC423',
    green: '#008752',
    red: '#D11241',
    blue: '#0069AA',
}

/**************************************************
 * Trimet helpers for interacting with the Trimet API
 * Britt Gresham - britt@brittg.com
 */



function serialize(o) {
   var str_parts = [];
   for(var p in o){
       if (o.hasOwnProperty(p)) {
           str_parts.push(encodeURIComponent(p) + "=" + encodeURIComponent(o[p]));
       }
   }
   return str_parts.join("&");
}

var Trimet = function(apikey) {
  var self = this;
  self.appID = apikey;
  self.baseurl = "https://developer.trimet.org/ws/V1/";

  self._request = function(endpoint, options) {
      urlparams = options['urlparams'] || {};
      method = options['method'] || 'get';

      urlparams['appID'] = urlparams['appID'] || self.appID;
      urlparams['json'] = true;

      var null_callback = function(data, status, request) {};
      success_callback = options['success'] || null_callback;
      error_callback = options['error'] || null_callback;

      var url = self.baseurl + endpoint + '?' + serialize(urlparams);

      console.log(url);

      ajax({
          url: url,
          method: method,
          type: 'json',
      }, success_callback, error_callback);
  }

  self.stops = function(lat, lon, callback) {
      radiusft = 2640;
      return self._request('stops', {
          urlparams: {
              ll: lon + "," + lat,
              feet: radiusft,
              showRouteDirs: true,
          },
          success: callback,
      });
  }

  self.arrivals = function(location_ids, callback) {
      return self._request('arrivals', {
          urlparams: {
              locids: location_ids.join(','),
          },
          success: callback,
      });
  }
};

var trimet = new Trimet(appid);
var selected_route = null;

function get_data(key, def) {
    var data = localStorage.getItem('pdxtransit');
    if (data == null) {
        data = {};
    } else {
        data = JSON.parse(data);
    }
    return data[key] || def;
}

function save_data(key, value) {
    var data = localStorage.getItem('pdxtransit');
    if (data == null) {
        data = {};
    } else {
        data = JSON.parse(data);
    }
    data[key] = value
    localStorage.setItem('pdxtransit', JSON.stringify(data));
}

/*
 * End of Trimet helpers
 **************************************************/

var loading = new UI.Card({
    title: 'Trimet Tracker',
    subtitle: 'Britt Gresham',
    body: 'One moment\nFinding stops near you...',
    backgroundColor: colors.trimetBlue,
    titleColor: colors.trimetWhite,
    subtitleColor: colors.trimetWhite, // Named colors
    bodyColor: colors.trimetWhite, // Hex colors
    style: 'small',
});

function init() {
    loading.show();

    //save_data('favorite_lines', []);

    navigator.geolocation.getCurrentPosition(
        function (pos) {
            trimet.stops(pos.coords.latitude, pos.coords.longitude, showRoutes);
        },
        function (err) {
            console.warn(err.message);
        },
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0,
        }
    );
}

function showRoutes(data) {
    var resultSet = data['resultSet']['location'];
    var routes = {
        order: [],
    };

    for (var i in resultSet) {
        var stop = resultSet[i];

        var locid = stop['locid'];
        var locname = stop['desc'];
        var direction = stop['dir'];

        for (var n in stop['route']) {
            var route = stop['route'][n];
            route['route'] = route['route'].toString();
            route['line'] = route['route'].toString();

            if (route['desc'].toLowerCase() == 'max shuttle') {
                continue;
            }

            // Separate by route
            if (route['type'] != 'B') {
                route['route'] = route['desc'];
                route['desc'] = null;
            }

            if (routes[route['route']] == null) {
                //if (routes.order.length >= 15) {
                //    continue;
                //}
                routes.order.push(route['route']);
                routes[route['route']] = {
                    type: route['type'],
                    line: route['line'],
                    to: {
                        order: [],
                    },
                    desc: route['desc'],
                };
            }

            // Add directions and stops to each route
            for (var d in route['dir']) {
                dir = route['dir'][d];
                if (routes[route['route']]['to'][dir['dir']] == null) {
                    routes[route['route']]['to'].order.push(dir['dir']);
                    routes[route['route']]['to'][dir['dir']] = {
                        name: dir['desc'],
                        stops: [],
                    }
                }
            }

            routes[route['route']]['to'][dir['dir']]['stops'].push({
                'locname': locname,
                'locid': locid,
            });
        }
    }

    rendered = [];
    function _render_line_item(name) {
        var ret = {
            title: name,
            route: routes[name],
        }
        if (routes[name]['desc']) {
            if (routes[name]['desc'].split('-')[0] == name) {
                var subtitle = routes[name]['desc'].split('-')
                subtitle.shift(0);
                ret['subtitle'] = subtitle.join(' ');
            } else {
                ret['subtitle'] = routes[name]['desc'];
            }
        }

        if (routes[name]['type'] == 'R') {
            if (ret['title'].split(' ')[0].toLowerCase() == 'max') {
                var parts = ret['title'].split(' ');
                parts.shift(0);
                ret['title'] = parts.join(' ');
                ret['icon'] = 'images/max_' + parts[0].toLowerCase() + '.png';
            } else if (ret['title'].split('-')[0].trim().toLowerCase() == 'portland streetcar') {
                var parts = ret['title'].split('-');
                ret['title'] = parts[1].trim();
                ret['icon'] = 'images/trimet_rail.png';
            }
        }
        rendered.push(routes[name]);
        return ret;
    }

    sections = [];
    favorites = get_data('favorite_lines', []);;

    if (favorites.length > 0) {
        sections.push({
            title: 'Favorites',
            items: routes.order.filter(function(item) {
                return rendered.indexOf(item) == -1 && favorites.indexOf(item) != -1;
            }).map(_render_line_item),
        });
    }

    sections.push({
        title: 'Lines',
        items: routes.order.filter(function(item) {
            return rendered.indexOf(item) == -1;
        }).map(_render_line_item),
    });

    var routeMenu = new UI.Menu({
        backgroundColor: colors.trimetWhite,
        textColor: colors.trimetBlack,
        highlightBackgroundColor: colors.trimetBlue,
        highlightTextColor: colors.trimetWhite,
        sections: sections,
    });

    routeMenu.on('select', function(e) {
        selected_route = e.item.route.line;
        showDirections(e.item.route);
    });

    routeMenu.on('longSelect', function(e) {
        return;
        var favorites = get_data('favorite_lines', []);
        if (favorites.indexOf(e.item.title) == -1) {
            favorites.push(e.item.title);
        } else {
            favorites = favorites.filter(function(item) {
                return item != e.item.title;
            });
        }
        save_data('favorite_lines', favorites);
        routeMenu.hide();
        init();
    });

    routeMenu.show();
    loading.hide();
}

function showDirections(route) {
    var directionsMenu = new UI.Menu({
        backgroundColor: colors.trimetWhite,
        textColor: colors.trimetBlack,
        highlightBackgroundColor: colors.trimetBlue,
        highlightTextColor: colors.trimetWhite,
        sections: [{
            title: route['desc'],
            items: route['to'].order.map(function(dir) {
                ret = {
                    title: route['to'][dir]['name'],
                    direction: route['to'][dir],
                };
                var parts = ret['title'].split(' ');
                if (parts[0].toLowerCase() == 'to') {
                    parts.shift(0);
                    ret['title'] = parts.join(' ');
                }
                return ret;
            }),
        }],
    });

    if (Object.keys(route['to']).length == 1) {
        return showStops(route['to'][Object.keys(route['to'])[0]]);;
    }

    directionsMenu.on('select', function(e) {
        showStops(e.item.direction);
    });

    directionsMenu.show();
}

function showStops(stops) {
    sections = {};
    var count = 0;
    var stop = null;
    for (var s in stops['stops']) {
        stop = stops['stops'][s];
        if (stop['locname'].endsWith("MAX Station")) {
            var parts = stop['locname'].split('MAX Station');
            var maj_rd = "MAX Station";
            var cross_rd = parts[0].trim();
        } else {
            var parts = stop['locname'].split('&');
            var maj_rd = parts[0].trim() + " &";
            parts.shift(0);
            var cross_rd = parts.join('&');
        }
        if (sections[maj_rd] == null) {
            sections[maj_rd] = {
                title: maj_rd,
                items: [],
            }
        }
        sections[maj_rd]['items'].push({
            title: cross_rd,
            locid: stop['locid'],
        });
        count += 1;
    }

    if (count == 1) {
        return trimet.arrivals([stop['locid']], showStopInformation);
    }

    var stopsMenu = new UI.Menu({
        backgroundColor: colors.trimetWhite,
        textColor: colors.trimetBlack,
        highlightBackgroundColor: colors.trimetBlue,
        highlightTextColor: colors.trimetWhite,
        sections: Object.keys(sections).map(function(key) {
            return sections[key];
        }),
    });

    stopsMenu.on('select', function(e) {
        trimet.arrivals([e.item.locid], showStopInformation);
    });

    stopsMenu.show();
}

function showStopInformation(data) {
    var resultSet = data['resultSet']['arrival'];
    scheduled = [];
    for (var i in resultSet) {
        arrival = resultSet[i];
        if (arrival['route'] != selected_route) {
            continue;
        }
        scheduled.push({
            departed: arrival['departed'],
            fullSign: arrival['fullSign'],
            shortSign: arrival['shortSign'],
            status: arrival['status'],
            route: arrival['route'],
            locid: arrival['locid'],
            estimated: new Date(arrival['estimated']),
            scheduled: new Date(arrival['scheduled']),
        });
    }

    function _body_info(detail) {
        var lines = []
        if (scheduled.length > 1) {
            for (var x=1; x<scheduled.length; x+=1) {
                lines.push(est_or_arr(scheduled[x]));
            }
        }
        lines.push("");
        lines.push("Stop ID: " + detail['locid']);
        return lines.join("\n");
    }

    if (scheduled.length > 0) {
        var detail = scheduled[0];
        var detailCard = new UI.Card({
            title: detail['shortSign'],
            subtitle: est_or_arr(detail),
            body: _body_info(detail),
            style: 'small',
            scrollable: true,
        });
        setInterval(function() {
            detailCard.subtitle(est_or_arr(detail));
            detailCard.body(_body_info(detail));
        }, 1000);
        if (detail['fullSign'].split(" ")[0].toLowerCase() == "max") {
            parts = detail['fullSign'].split(" ");
            parts.shift(0);
            while (parts[0] == "") {
                parts.shift(0);
            }
            detailCard.icon('images/max_' + parts[0].toLowerCase() + '.png');
        }
    } else {
        var detailCard = new UI.Card({
            title: 'No scheduled arrivals.',
            body: 'This stop is not reporting any scheduled arrivals.',
            style: 'small',
            scrollable: true,
        });
    }
    detailCard.show();
}

function est_or_arr(detail) {
    var now = new Date();
    var est = (detail['estimated'].getTime() - now.getTime()) / 1000;
    var sch = (detail['scheduled'].getTime() - now.getTime()) / 1000;
    if (detail['departed']) {
        return 'Arr: ' + seconds_to_human(est).trim();
    } else {
        return 'Sch: ' + seconds_to_human(sch).trim();
    }
}

function seconds_to_human(seconds) {
    if (seconds > 3600) {
        return Math.floor(seconds / 3600) + 'h ' + seconds_to_human(seconds % 3600);
    } else if (seconds > 60) {
        return Math.floor(seconds / 60) + 'm ' + seconds_to_human(seconds % 60);
    } else if (seconds > 0) {
        return Math.floor(seconds) + 's';
    } else {
        return "Due";
    }
}


// Boilerplate for initialization
init();
