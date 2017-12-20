'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var mongodb = require('mongodb');
var Collection = mongodb.Collection;

var MongoCollection = function () {
  function MongoCollection(mongoCollection, cachedCollections, cacheController) {
    _classCallCheck(this, MongoCollection);

    this._mongoCollection = mongoCollection;
    this._cachedCollections = cachedCollections;
    this._cacheController = cacheController;
  }

  // Does a find with "smart indexing".
  // Currently this just means, if it needs a geoindex and there is
  // none, then build the geoindex.
  // This could be improved a lot but it's not clear if that's a good
  // idea. Or even if this behavior is a good idea.


  _createClass(MongoCollection, [{
    key: 'find',
    value: function find(query) {
      var _this = this;

      var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
          skip = _ref.skip,
          limit = _ref.limit,
          sort = _ref.sort,
          keys = _ref.keys,
          readPreference = _ref.readPreference,
          maxTimeMS = _ref.maxTimeMS;

      return this._rawFind(query, { skip: skip, limit: limit, sort: sort, keys: keys, readPreference: readPreference, maxTimeMS: maxTimeMS }).catch(function (error) {
        // Check for "no geoindex" error
        if (error.code != 17007 && !error.message.match(/unable to find index for .geoNear/)) {
          throw error;
        }
        // Figure out what key needs an index
        var key = error.message.match(/field=([A-Za-z_0-9]+) /)[1];
        if (!key) {
          throw error;
        }

        var index = {};
        index[key] = '2d';
        return _this._mongoCollection.createIndex(index)
        // Retry, but just once.
        .then(function () {
          return _this._rawFind(query, { skip: skip, limit: limit, sort: sort, keys: keys, readPreference: readPreference, maxTimeMS: maxTimeMS });
        });
      });
    }
  }, {
    key: '_rawFind',
    value: function _rawFind(query) {
      var _ref2 = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
          skip = _ref2.skip,
          limit = _ref2.limit,
          sort = _ref2.sort,
          keys = _ref2.keys,
          readPreference = _ref2.readPreference,
          maxTimeMS = _ref2.maxTimeMS;

      var cacheResults = [];
      var mongoResults = [];
      var mongoNeeded = true;
      var mongoCollection = this._mongoCollection;
      var cachedCollections = this._cachedCollections;
      var cacheController = this._cacheController;

      function findFromCache() {
        if (cachedCollections && cachedCollections[mongoCollection.collectionName]) {
          if (!query || Object.keys(query).length == 0) {
            return cacheController.get('ClassCache:' + mongoCollection.collectionName).then(function (results) {
              if (results) {
                cacheResults = results;
                mongoNeeded = false;
              }
            });
          } else if (query) {
            var ids = null;
            var queryKeys = Object.keys(query);
            if (queryKeys.indexOf('_id') >= 0) {
              if (typeof query['_id'] == 'string') {
                ids = [query['_id']];
              } else if (_typeof(query['_id']) == 'object') {
                if (Object.keys(query['_id']).length == 1 && Array.isArray(query['_id']['$in'])) {
                  ids = query['_id']['$in'];
                }
              }

              if (ids) {
                var cachePossible = true;
                for (var queryProp in query) {
                  if (queryProp != '_rperm' && queryProp != '_id' && typeof query[queryProp] != 'string' && typeof query[queryProp] != 'number' && typeof query[queryProp] != 'boolean') {
                    cachePossible = false;
                  }
                }

                if (cachePossible) {
                  return cacheController.getMany(ids.map(function (id) {
                    return 'ObjectCache:' + mongoCollection.collectionName + ':' + id;
                  })).then(function (results) {
                    results.forEach(function (result) {
                      if (result) {
                        if (Array.isArray(query['_id']['$in'])) {
                          query['_id']['$in'].splice(query['_id']['$in'].indexOf(result['_id']), 1);
                        } else {
                          mongoNeeded = false;
                        }

                        var valid = true;
                        for (var queryProp in query) {
                          if (queryProp == '_rperm') {
                            if (result._rperm && result._rperm.length && result._rperm.indexOf('*') < 0 && result._rperm.filter(function (rperm) {
                              return query[queryProp].indexOf(rperm) >= 0;
                            }).length <= 0) {
                              valid = false;
                            }
                          } else if (queryProp != '_id') {
                            if (query[queryProp] != result[queryProp]) {
                              valid = false;
                            }
                          }
                        }

                        if (valid) {
                          cacheResults.push(result);
                        }
                      }
                    });

                    if (Array.isArray(query['_id']['$in']) && query['_id']['$in'].length == 0) {
                      mongoNeeded = false;
                    }
                  });
                }
              }
            }
          }
        }

        return Promise.resolve();
      }

      function findFromMongo() {
        if (mongoNeeded) {
          var findOperation = mongoCollection.find(query, { skip: skip, limit: limit, sort: sort, readPreference: readPreference });

          if (keys) {
            findOperation = findOperation.project(keys);
          }

          if (maxTimeMS) {
            findOperation = findOperation.maxTimeMS(maxTimeMS);
          }

          return findOperation.toArray().then(function (results) {
            if (results) {
              mongoResults = results;

              if (!keys && cachedCollections && cachedCollections[mongoCollection.collectionName]) {
                (function () {
                  var items = {};
                  results.forEach(function (result) {
                    items['ObjectCache:' + mongoCollection.collectionName + ':' + result['_id']] = result;
                  });
                  cacheController.putMany(items, cachedCollections[mongoCollection.collectionName].ttl);

                  if (!query || Object.keys(query).length == 0) {
                    cacheController.put('ClassCache:' + mongoCollection.collectionName, results, cachedCollections[mongoCollection.collectionName].ttl);
                  }
                })();
              }
            }
          });
        }
      }

      function merge() {
        return cacheResults.concat(mongoResults);
      }

      return findFromCache().then(findFromMongo).then(merge);
    }
  }, {
    key: 'count',
    value: function count(query) {
      var _ref3 = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
          skip = _ref3.skip,
          limit = _ref3.limit,
          sort = _ref3.sort,
          readPreference = _ref3.readPreference,
          maxTimeMS = _ref3.maxTimeMS;

      return this._mongoCollection.count(query, { skip: skip, limit: limit, sort: sort, readPreference: readPreference, maxTimeMS: maxTimeMS });
    }
  }, {
    key: 'insertOne',
    value: function insertOne(object) {
      return this._mongoCollection.insertOne(object);
    }

    // Atomically updates data in the database for a single (first) object that matched the query
    // If there is nothing that matches the query - does insert
    // Postgres Note: `INSERT ... ON CONFLICT UPDATE` that is available since 9.5.

  }, {
    key: 'upsertOne',
    value: function upsertOne(query, update) {
      return this._mongoCollection.update(query, update, { upsert: true });
    }
  }, {
    key: 'updateOne',
    value: function updateOne(query, update) {
      return this._mongoCollection.updateOne(query, update);
    }
  }, {
    key: 'updateMany',
    value: function updateMany(query, update) {
      return this._mongoCollection.updateMany(query, update);
    }
  }, {
    key: 'deleteOne',
    value: function deleteOne(query) {
      return this._mongoCollection.deleteOne(query);
    }
  }, {
    key: 'deleteMany',
    value: function deleteMany(query) {
      return this._mongoCollection.deleteMany(query);
    }
  }, {
    key: '_ensureSparseUniqueIndexInBackground',
    value: function _ensureSparseUniqueIndexInBackground(indexRequest) {
      var _this2 = this;

      return new Promise(function (resolve, reject) {
        _this2._mongoCollection.ensureIndex(indexRequest, { unique: true, background: true, sparse: true }, function (error, indexName) {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }
  }, {
    key: 'drop',
    value: function drop() {
      return this._mongoCollection.drop();
    }
  }]);

  return MongoCollection;
}();

exports.default = MongoCollection;