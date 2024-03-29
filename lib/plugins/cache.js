var comb = require("comb"),
  hitch = comb.hitch,
  Promise = comb.Promise,
  PromiseList = comb.PromiseList,
  Hive = require("hive-cache");


var hive;
var i = 0;

var LOGGER = comb.logging.Logger.getLogger("patio.plugins.CachePlugin");
/**
 * @class Adds in memory caching support for models.
 *
 * @example
 *
 * var MyModel = patio.addModel("testTable", {
 *     plugins : [patio.plugins.CachePlugin];
 * });
 *
 * //NOW IT WILL CACHE
 *
 * @name CachePlugin
 * @memberOf patio.plugins
 */
exports.CachePlugin = comb.define(null, {
  instance:{

    constructor:function() {
      if (!hive) hive = new Hive();
      this._super(arguments);
      this.post("load", this._postLoad);
    },

    reload:function() {
      var ret = new Promise();
      this._super(arguments).then(hitch(this, function(m) {
        hive.replace(m.table + m.primaryKeyValue, m);
        ret.callback(m);
      }), hitch(ret, "errback"));
      return ret;
    },

    _postLoad:function(next) {
      hive.replace(this.tableName + this.primaryKeyValue, this);
      next();
    },

    update:function(options, errback) {
      var ret = new Promise();
      this._super(arguments).then(hitch(this, function(val) {
        hive.remove(this.table + this.primaryKeyValue, val);
        ret.callback(val);
      }), hitch(ret, "errback"));
      return ret;
    },

    remove:function(errback) {
      hive.remove(this.primaryKeyValue);
      var ret = this._super(arguments);
      return ret;
    }
  },

  static:{

    findById:function(id) {
      var cached = hive.get(this.tableName + id);
      if (!cached) {
        LOGGER.info(this.tableName + " : " + id + " NOT CAHCED");
        return this._super(arguments);
      } else {
        LOGGER.info(this.tableName + " : " + id + " CAHCED");
        var ret = new Promise();
        ret.callback(cached);
        return ret;
      }
    }
  }
});