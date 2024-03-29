var comb = require("comb"),
  Promise = comb.Promise,
  PromiseList = comb.PromiseList,
  hitch = comb.hitch,
  array = comb.array,
  PatioError = require("../errors").PatioError;

var fetch = {
  LAZY:"lazy",
  EAGER:"eager"
};


/**
 * @class
 * Base class for all associations.
 *
 * </br>
 * <b>NOT to be instantiated directly</b>
 * Its just documented for reference.
 *
 * @constructs
 * @param {Object} options
 * @param {String} options.model a string to look up the model that we are associated with
 * @param {Function} options.filter  a callback to find association if a filter is defined then
 *                                    the association is read only
 * @param {Object} options.key object with left key and right key
 * @param {String|Object} options.orderBy<String|Object> - how to order our association @see Dataset.order
 * @param {fetch.EAGER|fetch.LAZY} options.fetchType the fetch type of the model if fetch.Eager is supplied then
 *                                    the associations are automatically filled, if fetch.Lazy is supplied
 *                                    then a promise is returned and is called back with the loaded models
 * @property {Model} model the model associatied with this association.
 * @name Association
 * @memberOf patio.associations
 * */
module.exports = exports = comb.define(comb.plugins.Middleware, {
  instance:{

    type:"",

    //Our associated model
    _model:null,

    /**
     * Fetch type
     */
    fetchType:fetch.LAZY,

    /**how to order our association*/
    orderBy:null,

    /**Our filter method*/
    filter:null,

    __hooks:null,

    isOwner:true,

    createSetter:true,

    isCascading:false,

    supportsStringKey:true,

    supportsHashKey:true,

    supportsCompositeKey:true,

    supportsLeftAndRightKey:true,

    /**
     *
     *Method to call to look up association,
     *called after the model has been filtered
     **/
    _fetchMethod:"all",


    constructor:function(options, patio, filter) {
      options = options || {};
      if (!options.model) throw new Error("Model is required for " + this.type + " association");
      this._model = options.model;
      this.patio = patio;
      this.__opts = options;
      !comb.isUndefined(options.isCascading) && (this.isCascading = options.isCascading);
      this.filter = filter;
      this.readOnly = comb.isBoolean(options.readOnly) ? options.readOnly : false;
      this.__hooks = {before:{add:null, remove:null, "set":null, load:null}, after:{add:null, remove:null, "set":null, load:null}};
      var hooks = ["Add", "Remove", "Set", "Load"];
      ["before", "after"].forEach(function(h) {
        hooks.forEach(function(a) {
          var hookName = h + a, hook;
          if (comb.isFunction((hook = options[hookName]))) {
            this.__hooks[h][a.toLowerCase()] = hook;
          }
        }, this);
      }, this);
      this.fetchType = options.fetchType || fetch.LAZY;
    },

    _callHook:function(hook, action, args) {
      var func = this.__hooks[hook][action], ret;
      if (comb.isFunction(func)) {
        ret = func.apply(this, args);
      }
      return ret;
    },

    _clearAssociations:function(model) {
      if (!this.readOnly) {
        delete model.__associations[this.name];
      }
    },

    _forceReloadAssociations:function(model) {
      if (!this.readOnly) {
        delete model.__associations[this.name];
        return model[this.name];
      }
    },

    /**
     * @return {Boolean} true if the association is eager.
     */
    isEager:function() {
      return this.fetchType == fetch.EAGER;
    },

    _checkAssociationKey:function(parent) {
      var q = {};
      this._setAssociationKeys(parent, q);
      return Object.keys(q).every(function(k) {
        return q[k] != null
      });
    },

    _getAssociationKey:function() {
      var options = this.__opts, key, ret = [], lk, rk;
      if (!comb.isUndefinedOrNull((key = options.key))) {
        if (this.supportsStringKey && comb.isString(key)) {
          //normalize the key first!
          ret = [
            [this.isOwner ? this.defaultLeftKey : key],
            [this.isOwner ? key : this.defaultRightKey]
          ];
        } else if (this.supportsHashKey && comb.isHash(key)) {
          var leftKey = Object.keys(key)[0];
          var rightKey = key[leftKey];
          ret = [
            [leftKey],
            [rightKey]
          ];
        } else if (this.supportsCompositeKey && comb.isArray(key)) {
          ret = [
            [key],
            null
          ];
        }
      } else if (this.supportsLeftAndRightKey && (!comb.isUndefinedOrNull((lk = options.leftKey)) && !comb.isUndefinedOrNull((rk = options.rightKey)))) {
        ret = [
          array.toArray(lk), array.toArray(rk)
        ];
      } else {
        //todo handle composite primary keys
        ret = [
          [this.defaultLeftKey],
          [this.defaultRightKey]
        ];
      }
      return ret;
    },


    _setAssociationKeys:function(parent, model, val) {
      var keys = this._getAssociationKey(parent), leftKey = keys[0], rightKey = keys[1];
      if (leftKey && rightKey) {
        for (var i = 0; i < leftKey.length; i++) {
          model[rightKey[i]] = !comb.isUndefined(val) ? val : parent[leftKey[i]];
        }
      } else {
        leftKey.forEach(function(k) {
          model[k] = !comb.isUndefined(val) ? val : parent[k];
        });
      }
    },

    _setDatasetOptions:function(ds) {
      var options = this.__opts || {};
      var order, limit, distinct, select, query;
      //allow for multi key ordering
      if (!comb.isUndefined((select = this.select))) {
        ds = ds.select.apply(ds, array.toArray(select));
      }
      if (!comb.isUndefined((query = options.query)) || !comb.isUndefined((query = options.conditions))) {
        ds = ds.filter(query);
      }
      if (comb.isFunction(this.filter)) {
        var ret = this.filter.apply(this, [ds]);
        if (comb.isInstanceOf(ret, ds._static)) {
          ds = ret;
        }
      }
      if (!comb.isUndefined((distinct = options.distinct))) {
        ds.limit.apply(ds, array.toArray(distinct));
      }
      if (!comb.isUndefined((order = options.orderBy)) || !comb.isUndefined((order = options.order))) {
        ds.order.apply(ds, array.toArray(order));
      }
      if (!comb.isUndefined((limit = options.limit))) {
        ds.limit.apply(ds, array.toArray(limit));
      }
      return ds;

    },

    /**
     *Filters our associated dataset to load our association.
     *
     *@return {Dataset} the dataset with all filters applied.
     **/
    _filter:function(parent) {
      var options = this.__opts || {};
      var ds;
      if (!comb.isUndefined((ds = options.dataset)) && comb.isFunction(ds)) {
        ds = ds.apply(parent, [parent]);
      }
      if (!ds) {
        ds = this.model.dataset.naked();
      }
      var q = {};
      this._setAssociationKeys(parent, q);
      return this._setDatasetOptions(ds.filter(q));
    },

    __setValue:function(parent, model) {
      parent.__associations[this.name] = this._fetchMethod == "all" ? !comb.isArray(model) ? [model] : model : comb.isArray(model) ? model[0] : model;
      return parent.__associations[this.name];
    },

    __loadModel:function(parent, model, setValue) {
      var ret = new Promise();
      setValue = comb.isBoolean(setValue) ? setValue : true;
      if (comb.isArray(model)) {
        var pl = new PromiseList(model.map(hitch(this, function(m) {
          //dont set the value because we have an array
          //and it will be set in the callback
          return this.__loadModel(parent, m, false);
        })), true);
        if (setValue) {
          pl.then(hitch(this, function(models) {
            //now we can set the value!!!
            this.__setValue(parent, models);
            ret.callback(models);
          }), hitch(ret, "errback"));
        } else {
          ret = pl;
        }
      } else {
        model = this._toModel(model, true);
        var recip = this.model._findAssociation(this);
        if (recip) {
          recip = recip[1];
          recip.__setValue(model, parent);
        }
        setValue && this.__setValue(parent, model);
        //call hook to finish other model associations
        model._hook("post", "load").then(hitch(this, function() {
          ret.callback(model);
        }), hitch(ret, "errback"));
      }
      return ret;
    },


    fetch:function(parent) {
      var ret = new Promise();
      if (this._checkAssociationKey(parent)) {
        this._filter(parent)[this._fetchMethod]().then(hitch(this, function(result) {
          var p;
          if ((comb.isArray(result) && result.length) || comb.isHash(result)) {
            p = this.__loadModel(parent, result);
          } else {
            this.__setValue(parent, result);
            p = new Promise().callback(result);
          }
          p.then(hitch(ret, "callback"), hitch(ret, "errback"));
        }), hitch(ret, "errback"));
      } else {
        this.__setValue(parent, null);
        ret.callback(null);
      }
      return ret;
    },

    /**
     * Middleware called before a model is removed.
     * </br>
     * <b> This is called in the scope of the model</b>
     * @param {Function} next function to pass control up the middleware stack.
     * @param {_Association} self reference to the Association that is being acted up.
     */
    _preRemove:function(next, model) {
      if (this.isOwner && !this.isCascading) {
        var q = {};
        this._setAssociationKeys(model, q, null);
        model[this.associatedDatasetName].update(q).then(next, function(e) {
          throw e;
        });
      } else {
        next();
      }
    },

    /**
     * Middleware called aft era model is removed.
     * </br>
     * <b> This is called in the scope of the model</b>
     * @param {Function} next function to pass control up the middleware stack.
     * @param {_Association} self reference to the Association that is being called.
     */
    _postRemove:function(next, model) {
      next();
    },

    /**
     * Middleware called before a model is saved.
     * </br>
     * <b> This is called in the scope of the model</b>
     * @param {Function} next function to pass control up the middleware stack.
     * @param {_Association} self reference to the Association that is being called.
     */
    _preSave:function(next, model) {
      next();
    },

    /**
     * Middleware called after a model is saved.
     * </br>
     * <b> This is called in the scope of the model</b>
     * @param {Function} next function to pass control up the middleware stack.
     * @param {_Association} self reference to the Association that is being called.
     */
    _postSave:function(next, model) {
      next();
    },

    /**
     * Middleware called before a model is updated.
     * </br>
     * <b> This is called in the scope of the model</b>
     * @param {Function} next function to pass control up the middleware stack.
     * @param {_Association} self reference to the Association that is being called.
     */
    _preUpdate:function(next, model) {
      next();
    },

    /**
     * Middleware called before a model is updated.
     * </br>
     * <b> This is called in the scope of the model</b>
     * @param {Function} next function to pass control up the middleware stack.
     * @param {_Association} self reference to the Association that is being called.
     */
    _postUpdate:function(next, model) {
      next();
    },

    /**
     * Middleware called before a model is loaded.
     * </br>
     * <b> This is called in the scope of the model</b>
     * @param {Function} next function to pass control up the middleware stack.
     * @param {_Association} self reference to the Association that is being called.
     */
    _preLoad:function(next, model) {
      next();
    },

    /**
     * Middleware called after a model is loaded.
     * </br>
     * <b> This is called in the scope of the model</b>
     * @param {Function} next function to pass control up the middleware stack.
     * @param {_Association} self reference to the Association that is being called.
     */
    _postLoad:function(next, model) {
      next();
    },

    /**
     * Alias used to explicitly set an association on a model.
     * @param {*} val the value to set the association to
     * @param {_Association} self reference to the Association that is being called.
     */
    _setter:function(val, model) {
      model.__associations[this.name] = val;
    },

    associationLoaded:function(model) {
      return model.__associations.hasOwnProperty(this.name);
    },

    getAssociation:function(model) {
      return model.__associations[this.name];
    },

    /**
     * Alias used to explicitly get an association on a model.
     * @param {_Association} self reference to the Association that is being called.
     */
    _getter:function(model) {
      //if we have them return them;
      if (this.associationLoaded(model)) {
        var assoc = this.getAssociation(model);
        return this.isEager() ? assoc : new Promise().callback(assoc);
      } else if (model.isNew) {
        return null;
      } else {
        return this.fetch(model);
      }
    },

    _toModel:function(val, fromDb) {
      var Model = this.model;
      if (!comb.isUndefinedOrNull(Model)) {
        if (!comb.isInstanceOf(val, Model)) {
          val = new this.model(val, fromDb);
        }
      }else{
        throw new PatioError("Invalid model " + this.name);
      }
      return val;
    },

    /**
     * Method to inject functionality into a model. This method alters the model
     * to prepare it for associations, and initializes all required middleware calls
     * to fulfill requirements needed to loaded the associations.
     *
     * @param {Model} parent the model that is having an associtaion set on it.
     * @param {String} name the name of the association.
     */
    inject:function(parent, name) {
      this.name = name;
      var self = this;
      this.parent = parent;
      parent.prototype.__defineGetter__(name, function() {
        return  self._getter(this);
      });
      parent.prototype.__defineGetter__(this.associatedDatasetName, function() {
        return  self._filter(this);
      });

      if (!this.readOnly && this.createSetter) {
        //define a setter because we arent read only
        parent.prototype.__defineSetter__(name, function(vals) {
          self._setter(vals, this);
        });
      }

      //set up all callbacks
      ["pre", "post"].forEach(function(op) {
        ["save", "update", "remove", "load"].forEach(function(type) {
          parent[op](type, function(next) {
            return self["_" + op + type.charAt(0).toUpperCase() + type.slice(1)](next, this);
          });
        }, this);
      }, this);
    },

    getters:{

      select:function() {
        return this.__opts.select;
      },

      defaultLeftKey:function() {
        var ret = "";
        if (this.isOwner) {
          ret = this.__opts.primaryKey || this.parent.primaryKey[0]
        } else {
          ret = this.model.tableName + "Id";
        }
        return ret;
      },

      defaultRightKey:function() {
        return this.associatedModelKey;
      },

      //Returns our model
      model:function() {
        return this.patio.getModel(this._model, this.parent.db);
      },

      associatedModelKey:function() {
        var ret = "";
        if (this.isOwner) {
          ret = this.__opts.primaryKey || this.parent.tableName + "Id";
        } else {
          ret = this.model.primaryKey[0];
        }
        return ret;
      },

      associatedDatasetName:function() {
        return this.name + "Dataset"
      },

      removeAssociationFlagName:function() {
        return "__remove" + this.name + "association"
      }

    }
  },

  static:{

    fetch:{

      LAZY:"lazy",

      EAGER:"eager"
    }
  }
});