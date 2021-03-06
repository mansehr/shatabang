"use strict";

var express        = require("express"),
    bodyParser     = require('body-parser'),
    compression    = require('compression'),
    shFiles        = require('./modules/shatabang_files'),
    session        = require('express-session'),
    sha256         = require('sha256'),
    kue            = require('kue'),
    redisStore     = require( 'connect-redis' )( session ),
    app            = express(),
    path           = require('path'),
    passport       = require('passport'),
    GoogleStrategy = require('passport-google-oauth').OAuth2Strategy,
    LocalStrategy  = require('passport-local').Strategy;

var config = require('./config_server.json'); //JSON.parse(fs.readFileSync('server_config.json', 'utf8'));

// API Access link for creating client ID and secret:
// https://code.google.com/apis/console/
var GOOGLE_CLIENT_ID      = config.google_client_id,
    GOOGLE_CLIENT_SECRET  = config.google_client_secret,
    GOOGLE_CALLBACK_URL = config.google_auth_callback_url,
    GOOGLE_ALLOWED_IDS = config.google_auth_allowed_ids,
    ADMIN_HASH = config.admin_hash,
    SERVER_SALT = config.server_salt;

var REDIS_HOST = process.env.REDIS_PORT_6379_TCP_ADDR || '127.0.0.1';
var REDIS_PORT = process.env.REDIS_PORT_6379_TCP_PORT || 6379;
var BASE_URL = config.baseUrl || '/';
var PORT = config.port || 3000;

var storageDir = config.storageDir; //'/Volumes/Mini\ Stick/sorted/';
var cacheDir = config.cacheDir; // '/Volumes/Mini\ Stick/cache/';
var deleteDir = config.deletedDir = path.join(storageDir, 'deleted');
var uploadDir = config.uploadDir = path.join(storageDir, 'upload');
var importDir = config.importDir = path.join(storageDir, 'import');

// Check that directories exists
[uploadDir, importDir, deleteDir, path.join(cacheDir, 'info')].forEach(function(directory) {
  if(!shFiles.exists(directory)) {
    console.log("Directory dir does not exists. Trying to create it.", directory);
    shFiles.mkdirsSync(directory);
  }
});

var routes = [];
routes.push({path: 'upload', route: require('./routes/uploads')});
routes.push({path: 'images', route: require('./routes/images')});
routes.push({path: 'faces', route: require('./routes/faces')});
routes.push({path: 'duplicates', route: require('./routes/duplicates')});
routes.push({path: 'dirs', route: require('./routes/dirs')});
routes.push({path: 'auth', route: require('./routes/auth'), public: true});

routes.forEach(function(itm) {
  itm.route.initialize(config);
});

passport.serializeUser(function(user, done) {
  console.log('serializeUser', user.displayName);
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  // console.log('deserializeUser', obj.displayName);
  done(null, obj);
});

if(GOOGLE_CLIENT_ID) {
  console.log('Loading google authentication.');
  passport.use(new GoogleStrategy({
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: GOOGLE_CALLBACK_URL
      //passReqToCallback : true
    },
    function(accessToken, refreshToken, profile, done) {
      // asynchronous verification, for effect...
     process.nextTick(function () {
       if(GOOGLE_ALLOWED_IDS.indexOf(profile.id) < 0) {
         profile = null;
       }

       // To keep the example simple, the user's Google profile is returned to
       // represent the logged-in user.  In a typical application, you would want
       // to associate the Google account with a user record in your database,
       // and return that user instead.
       return done(null, profile);
     });
    }
  ));
} else if(ADMIN_HASH) {
  console.log('Loading local with admin authentication.');
  passport.use(new LocalStrategy(
    function(username, password, done) {
        if ("admin" !== username.toLowerCase()) {
          return done(null, false, { message: 'Incorrect username.' });
        }
        var hash = sha256(password + SERVER_SALT);
        if (hash !== ADMIN_HASH) {
          return done(null, false, { message: 'Incorrect password.' });
        }
        return done(null, {username: 'admin', displayName: 'admin'});
    }));
} else {
  console.log('No authentication mechanism configured.');
}

app.use(bodyParser.json());
app.use(compression());
app.use(session({
	secret: SERVER_SALT,
	name:   'cookie67',
  resave: true,
  saveUninitialized: true,
  store: new redisStore({
    host: REDIS_HOST,
    port: REDIS_PORT,
    ttl :  900
  })
}));
app.use(passport.initialize());
app.use(passport.session());

app.get('/',function(req,res){
      res.sendFile(__dirname + "/client/index.html");
});

// Redirect the user to Google for authentication.  When complete, Google
// will redirect the user back to the application at
//     /auth/google/return
app.get('/auth/google', passport.authenticate('google',
{ scope: ['https://www.googleapis.com/auth/userinfo.email'
  /*'https://www.googleapis.com/auth/drive.photos.readonly',
  'https://www.googleapis.com/auth/plus.media.upload'*/] }));

// Google will redirect the user to this URL after authentication.  Finish
// the process by verifying the assertion.  If valid, the user will be
// logged in.  Otherwise, authentication has failed.
app.get('/auth/google/return',
  passport.authenticate('google', { successRedirect: BASE_URL,
                                    failureRedirect: BASE_URL + '?bad=true' }));

app.use('/loginform', bodyParser.urlencoded({ extended: true }));
app.post('/loginform',
  passport.authenticate('local', { failureRedirect: BASE_URL + '?bad=true' }),
    function(req, res) { res.redirect(BASE_URL); }
  );

// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
function requireAuthentication(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.send().status(401);
}

app.get('/api/account', function(req, res) {
  var sess = req.session;
  if(sess === undefined) {
    // The client is missing a session, return unauthorized response
    res.send().status(500);
    return false;
  }
  if (!sess.views) {
    sess.views  = 0;
  }
  sess.views++;
  res.json({ user: req.user });
});

app.get('/logout', function(req, res) {
  req.logout();
  res.redirect('/');
});
/// End Authentication

// Secure the api and images path
app.all('/images/*', requireAuthentication);
app.all('/media/*', requireAuthentication);

app.use('/images', express.static(cacheDir));
app.use('/media', express.static(storageDir));

// Map the routes
routes.forEach(function(route) {
  var path = '/api/' + route.path;
  if(route.public !== true) {
    app.all(path + '/*', requireAuthentication);
  }
  app.use(path, route.route);
});

kue.app.set('title', 'Shatabang Work que');
app.use('/kue', kue.app);
app.use('/', express.static(__dirname + "/client/"));

app.listen(PORT, function(){
  console.log("Working on port " + PORT);
});
