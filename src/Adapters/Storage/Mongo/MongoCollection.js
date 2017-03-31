let mongodb = require('mongodb');
let Collection = mongodb.Collection;

export default class MongoCollection {
  _mongoCollection:Collection;
  _cachedCollections:Object;
  _cacheController:Object;

  constructor(mongoCollection:Collection, cachedCollections:Array, cacheController) {
    this._mongoCollection = mongoCollection;
    this._cachedCollections = cachedCollections;
    this._cacheController = cacheController;
  }

  // Does a find with "smart indexing".
  // Currently this just means, if it needs a geoindex and there is
  // none, then build the geoindex.
  // This could be improved a lot but it's not clear if that's a good
  // idea. Or even if this behavior is a good idea.
  find(query, { skip, limit, sort, keys, readPreference, maxTimeMS } = {}) {
    return this._rawFind(query, { skip, limit, sort, keys, readPreference, maxTimeMS })
      .catch(error => {
        // Check for "no geoindex" error
        if (error.code != 17007 && !error.message.match(/unable to find index for .geoNear/)) {
          throw error;
        }
        // Figure out what key needs an index
        let key = error.message.match(/field=([A-Za-z_0-9]+) /)[1];
        if (!key) {
          throw error;
        }

        var index = {};
        index[key] = '2d';
        return this._mongoCollection.createIndex(index)
          // Retry, but just once.
          .then(() => this._rawFind(query, { skip, limit, sort, keys, readPreference, maxTimeMS }));
      });
  }

  _rawFind(query, { skip, limit, sort, keys, readPreference, maxTimeMS } = {}) {
    let cacheResults = [];
    let mongoResults = [];
    let mongoNeeded = true;
    let mongoCollection = this._mongoCollection;
    let cachedCollections = this._cachedCollections;
    let cacheController = this._cacheController;

    function findFromCache() {
      if (cachedCollections && cachedCollections[mongoCollection.collectionName]) {
        if (!query || query == {}) {
          return cacheController.get('ClassCache:' + mongoCollection.collectionName).then((results) => {
            if (results) {
              cacheResults = results;
              mongoNeeded = false;
            }
          });
        } else if (query) {
          let ids = null;
          let queryKeys = Object.keys(query);
          if (queryKeys.indexOf('_id') >= 0) {
            if (typeof query['_id'] == 'string') {
              ids = [query['_id']]
            } else if (typeof query['_id'] == 'object') {
              if (Object.keys(query['_id']) == 1 && Array.isArray(query['_id']['$in'])) {
                ids = query['_id']['$in'];
              }
            }

            if (ids) {
              let cachePossible = true;
              for (var queryProp in query) {
                if (
                  queryProp != '_rperm' &&
                  queryProp != '_id' &&
                  typeof query[queryProp] != 'string' &&
                  typeof query[queryProp] != 'number' &&
                  typeof query[queryProp] != 'boolean'
                ) {
                  cachePossible = false;
                }
              }

              if (cachePossible) {
                return cacheController.getMany(ids.map((id) => { return 'ObjectCache:' + mongoCollection.collectionName + ':' + id; })).then((results) => {
                  results.forEach((result) => {
                    if (result) {
                      if (Array.isArray(query['_id']['$in'])) {
                        query['_id']['$in'].splice(query['_id']['$in'].indexOf(result['_id']), 1);
                      } else {
                        mongoNeeded = false;
                      }

                      let valid = true;
                      for (var queryProp in query) {
                        if (queryProp == '_rperm') {
                          if (
                            result._rperm &&
                            result._rperm.length &&
                            result._rperm.indexOf('*') < 0 &&
                            result._rperm.filter((rperm) => { return query[queryProp].indexOf(rperm) >= 0; }).length <= 0
                          ) {
                            valid = false
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
        let findOperation = mongoCollection
          .find(query, { skip, limit, sort, readPreference })

        if (keys) {
          findOperation = findOperation.project(keys);
        }

        if (maxTimeMS) {
          findOperation = findOperation.maxTimeMS(maxTimeMS);
        }

        return findOperation
          .toArray()
          .then((results) => {
            if (results) {
              mongoResults = results;

              if (cachedCollections && cachedCollections[mongoCollection.collectionName]) {
                let items = {};
                results.forEach((result) => {
                  items['ObjectCache:' + mongoCollection.collectionName + ':' + result['_id']] = result;
                });
                cacheController.putMany(items, cachedCollections[mongoCollection.collectionName].ttl);

                if (!query || query == {}) {
                  return cacheController.put('ClassCache:' + mongoCollection.collectionName, results, cachedCollections[mongoCollection.collectionName].ttl);
                }
              }
            }
          });
      }
    }

    function merge() {
      return cacheResults.concat(mongoResults);
    }

    return findFromCache()
      .then(findFromMongo)
      .then(merge);
  }

  count(query, { skip, limit, sort, readPreference, maxTimeMS } = {}) {
    return this._mongoCollection.count(query, { skip, limit, sort, readPreference, maxTimeMS });
  }

  insertOne(object) {
    return this._mongoCollection.insertOne(object);
  }

  // Atomically updates data in the database for a single (first) object that matched the query
  // If there is nothing that matches the query - does insert
  // Postgres Note: `INSERT ... ON CONFLICT UPDATE` that is available since 9.5.
  upsertOne(query, update) {
    return this._mongoCollection.update(query, update, { upsert: true })
  }

  updateOne(query, update) {
    return this._mongoCollection.updateOne(query, update);
  }

  updateMany(query, update) {
    return this._mongoCollection.updateMany(query, update);
  }

  deleteOne(query) {
    return this._mongoCollection.deleteOne(query);
  }

  deleteMany(query) {
    return this._mongoCollection.deleteMany(query);
  }

  _ensureSparseUniqueIndexInBackground(indexRequest) {
    return new Promise((resolve, reject) => {
      this._mongoCollection.ensureIndex(indexRequest, { unique: true, background: true, sparse: true }, (error, indexName) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  drop() {
    return this._mongoCollection.drop();
  }
}
