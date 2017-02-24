'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createSubscriber = exports.createPublisher = exports.RedisPubSub = undefined;

var _redis = require('redis');

var _redis2 = _interopRequireDefault(_redis);

var _node = require('parse/node');

var _node2 = _interopRequireDefault(_node);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function createPublisher(_ref) {
  var redisURL = _ref.redisURL;

  var redisCli = _redis2.default.createClient(redisURL, { no_ready_check: true });

  redisCli.publish2 = redisCli.publish;

  redisCli.publish = function (channel, body) {
    try {
      var bodyObject = JSON.parse(body);
      if (bodyObject && bodyObject.pushStatus) {
        redisCli.multi([['sadd', bodyObject.applicationId + ':push', body]]).exec();
      }
    } catch (e) {}
    return redisCli.publish2(channel, body);
  };

  return redisCli;
}

function createSubscriber(_ref2) {
  var redisURL = _ref2.redisURL;

  var redisCli = _redis2.default.createClient(redisURL, { no_ready_check: true });
  var secondaryClient = _redis2.default.createClient(redisURL, { no_ready_check: true });
  redisCli.run = function (workItem) {
    return new _node2.default.Promise(function (resolve) {
      secondaryClient.multi([['spop', workItem.applicationId + ':push']]).exec(function (err, rep) {
        if (!err && rep && rep[0]) {
          resolve(JSON.parse(rep[0]));
        } else {
          resolve();
        }
      });
    });
  };

  return redisCli;
}

var RedisPubSub = {
  createPublisher: createPublisher,
  createSubscriber: createSubscriber
};

exports.RedisPubSub = RedisPubSub;
exports.createPublisher = createPublisher;
exports.createSubscriber = createSubscriber;