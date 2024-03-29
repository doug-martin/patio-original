var comb = require("comb"),
    ModelError = require("./errors").ModelError,
    plugins = require("./plugins"),
    AssociationPlugin = plugins.AssociationPlugin,
    QueryPlugin = plugins.QueryPlugin,
    Promise = comb.Promise,
    PromiseList = comb.PromiseList,
    hitch = comb.hitch,
    patio;

var applyColumnTransformMethod = function(val, meth){
    return !comb.isUndefinedOrNull(meth) ? comb.isFunction(val[meth]) ? val[meth] : comb.isFunction(comb[meth]) ? comb[meth](val) : val : val;
};

var Model = comb.define([QueryPlugin, AssociationPlugin, comb.plugins.Middleware], {
    instance:{
        /**
         * @lends patio.Model.prototype
         */

        __ignore:false,

        __changed:null,

        __values:null,

        /**
         * patio  - read only
         *
         * @type patio
         */
        patio:null,

        /**
         * The database type such as mysql
         *
         * @typre String
         *
         * */
        type:null,

        /**
         * Whether or not this model is new
         * */
        __isNew:true,

        /**
         * Signifies if the model has changed
         * */
        __isChanged:false,

        /**
         * Base class for all models.
         * <p>This is used through {@link patio.addModel}, <b>NOT directly.</b></p>
         *
         * @constructs
         * @augments comb.plugins.Middleware
         *
         * @param {Object} columnValues values of each column to be used by this Model.
         *
         * @property {patio.Dataset} dataset a dataset to use to retrieve models from the database. The dataset
         *                          has the {@link patio.Dataset#rowCb} set to create instances of this model.
         * @property {String[]} columns a list of columns this models table contains.
         * @property {Object} schema the schema of this models table.
         * @property {String} tableName the table name of this models table.
         * @property {*} primaryKeyValue the value of this models primaryKey
         * @property {Boolean} isNew true if this model is new and does not exist in the database.
         * @property {Boolean} isChanged true if the model has been changed and not saved.
         *
         * @borrows patio.Dataset#all as all
         * @borrows patio.Dataset#one as one
         * @borrows patio.Dataset#avg as avg
         * @borrows patio.Dataset#count as count
         * @borrows patio.Dataset#columns as columns
         * @borrows patio.Dataset#forEach as forEach
         * @borrows patio.Dataset#isEmpty as empty
         * @borrows patio.Dataset#first as first
         * @borrows patio.Dataset#get as get
         * @borrows patio.Dataset#import as import
         * @borrows patio.Dataset#insert as insert
         * @borrows patio.Dataset#insertMultiple as insertMultiple
         * @borrows patio.Dataset#saveMultiple as saveMultiple
         * @borrows patio.Dataset#interval as interval
         * @borrows patio.Dataset#last as last
         * @borrows patio.Dataset#map as map
         * @borrows patio.Dataset#max as max
         * @borrows patio.Dataset#min as min
         * @borrows patio.Dataset#multiInsert as multiInsert
         * @borrows patio.Dataset#range as range
         * @borrows patio.Dataset#selectHash as selectHash
         * @borrows patio.Dataset#selectMap as selectMap
         * @borrows patio.Dataset#selectOrderMap as selectOrderMap
         * @borrows patio.Dataset#set as set
         * @borrows patio.Dataset#singleRecord as singleRecord
         * @borrows patio.Dataset#singleValue as singleValue
         * @borrows patio.Dataset#sum as sum
         * @borrows patio.Dataset#toCsv as toCsv
         * @borrows patio.Dataset#toHash as toHash
         * @borrows patio.Dataset#truncate as truncate
         * @borrows patio.Dataset#addGraphAliases as addGraphAliases
         * @borrows patio.Dataset#and as and
         * @borrows patio.Dataset#distinct as distinct
         * @borrows patio.Dataset#except as except
         * @borrows patio.Dataset#exclude as exclude
         * @borrows patio.Dataset#is as is
         * @borrows patio.Dataset#isNot as isNot
         * @borrows patio.Dataset#eq as eq
         * @borrows patio.Dataset#neq as neq
         * @borrows patio.Dataset#lt as lt
         * @borrows patio.Dataset#lte as lte
         * @borrows patio.Dataset#gt as gt
         * @borrows patio.Dataset#gte as gte
         * @borrows patio.Dataset#forUpdate as forUpdate
         * @borrows patio.Dataset#from as from
         * @borrows patio.Dataset#fromSelf as fromSelf
         * @borrows patio.Dataset#graph as graph
         * @borrows patio.Dataset#grep as grep
         * @borrows patio.Dataset#group as group
         * @borrows patio.Dataset#groupAndCount as groupAndCount
         * @borrows patio.Dataset#groupBy as groupBy
         * @borrows patio.Dataset#having as having
         * @borrows patio.Dataset#intersect as intersect
         * @borrows patio.Dataset#invert as invert
         * @borrows patio.Dataset#limit as limit
         * @borrows patio.Dataset#lockStyle as lockStyle
         * @borrows patio.Dataset#naked as naked
         * @borrows patio.Dataset#or as or
         * @borrows patio.Dataset#order as order
         * @borrows patio.Dataset#orderAppend as orderAppend
         * @borrows patio.Dataset#orderBy as orderBy
         * @borrows patio.Dataset#orderMore as orderMore
         * @borrows patio.Dataset#orderPrepend as orderPrepend
         * @borrows patio.Dataset#qualify as qualify
         * @borrows patio.Dataset#reverse as reverse
         * @borrows patio.Dataset#reverseOrder as reverseOrder
         * @borrows patio.Dataset#select as select
         * @borrows patio.Dataset#selectAll as selectAll
         * @borrows patio.Dataset#selectAppend as selectAppend
         * @borrows patio.Dataset#selectMore as selectMore
         * @borrows patio.Dataset#setDefaults as setDefaults
         * @borrows patio.Dataset#setGraphAliases as setGraphAliases
         * @borrows patio.Dataset#setOverrides as setOverrides
         * @borrows patio.Dataset#unfiltered as unfiltered
         * @borrows patio.Dataset#ungraphed as ungraphed
         * @borrows patio.Dataset#ungrouped as ungrouped
         * @borrows patio.Dataset#union as union
         * @borrows patio.Dataset#unlimited as unlimited
         * @borrows patio.Dataset#unordered as unordered
         * @borrows patio.Dataset#where as where
         * @borrows patio.Dataset#with as with
         * @borrows patio.Dataset#withRecursive as withRecursive
         * @borrows patio.Dataset#withSql as withSql
         * @borrows patio.Dataset#naturalJoin as naturalJoin
         * @borrows patio.Dataset#naturalLeftJoin as naturalLeftJoin
         * @borrows patio.Dataset#naturalRightJoin as naturalRightJoin
         * @borrows patio.Dataset#naturalFullJoin as naturalFullJoin
         * @borrows patio.Dataset#crossJoin as crossJoin
         * @borrows patio.Dataset#innerJoin as innerJoin
         * @borrows patio.Dataset#fullOuterJoin as fullOuterJoin
         * @borrows patio.Dataset#rightOuterJoin as rightOuterJoin
         * @borrows patio.Dataset#leftOuterJoin as leftOuterJoin
         * @borrows patio.Dataset#fullJoin as fullJoin
         * @borrows patio.Dataset#rightJoin as rightJoin
         * @borrows patio.Dataset#leftJoin as leftJoin
         * */
        constructor:function(options, fromDb){
            this._super(arguments);
            fromDb = comb.isBoolean(fromDb) ? fromDb : false;
            this.__changed = {};
            this.__values = {};
            if (fromDb) {
                this._hook("pre", "load");
                this.__isNew = false;
                this.__set(options, true);
            } else {
                this.__isNew = true;
                this.__set(options);
            }
        },

        __set:function(values, ignore){
            values = values || {};
            ignore = ignore == true;
            this.__ignore = ignore;
            Object.keys(values).forEach(function(i){
                this[i] = values[i];
            }, this);
            this.__ignore = false;
        },

        _toObject:function(){
            var columns = this._static.columns, ret = {};
            for (var i in columns) {
                var col = columns[i], val = this[col];
                if (!comb.isUndefined(val)) {
                    ret[col] = val;
                }
            }
            return ret;
        },

        //Typecast the value to the column's type if typecasting.  Calls the database's
        //typecast_value method, so database adapters can override/augment the handling
        //for database specific column types.
        _typeCastValue:function(column, value, fromDatabase){
            var colSchema, clazz = this._static;
            if (((fromDatabase && clazz.typecastOnLoad) || (!fromDatabase && clazz.typecastOnAssignment == true)) && !comb.isUndefinedOrNull(this.schema) && !comb.isUndefinedOrNull((colSchema = this.schema[column]))) {
                var type = colSchema.type;
                if (value === "" && clazz.typecastEmptyStringToNull == true && !comb.isUndefinedOrNull(type) && ["string", "blob"].indexOf(type) == -1) {
                    value = null;
                }
                var raiseOnError = clazz.raiseOnTypecastError;
                if (raiseOnError === true && comb.isUndefinedOrNull(value) && colSchema.allowNull === false) {
                    throw new ModelError("null is not allowed for the " + column + " column.");
                }
                try {
                    value = clazz.db.typecastValue(type, value);
                } catch (e) {
                    if (raiseOnError === true) {
                        throw e;
                    }
                }
            }
            return value;
        },

        /**
         * Convert this model to an object, containing column, value pairs.
         *
         * @return {Object} the object version of this model.
         **/
        toObject:function(){
            return this._toObject(false);
        },

        /**
         * Convert this model to JSON, containing column, value pairs.
         *
         * @return {JSON} the JSON version of this model.
         **/
        toJSON:function(){
            return this.toObject();
        },

        /**
         * Convert this model to a string, containing column, value pairs.
         *
         * @return {String} the string version of this model.
         **/
        toString:function(){
            return JSON.stringify(this.toObject(), null, 4);
        },

        /**
         * Convert this model to a string, containing column, value pairs.
         *
         * @return {String} the string version of this model.
         **/
        valueOf:function(){
            return this.toObject();
        },

        _checkTransaction:function(options, cb){
            return this._static._checkTransaction(options, cb);
        },


        getters:{
            /**@lends patio.Model.prototype*/
            /*Returns my actual primary key value*/
            primaryKeyValue:function(){
                return this[this.primaryKey];
            },

            /*Return if Im a new object*/
            isNew:function(){
                return this.__isNew;
            },

            /*Return if Im changed*/
            isChanged:function(){
                return this.__isChanged;
            }

        }
    },

    static:{
        /**
         * @lends patio.Model
         */
        /**
         * Set to false to prevent empty strings from being type casted to null
         * @default true
         */
        typecastEmptyStringToNull:true,

        /**
         * Set to false to prevent properties from being type casted when loaded from the database.
         * See {@link patio.Database#typecastValue}
         * @default true
         */
        typecastOnLoad:true,

        /**
         * Set to false to prevent properties from being type casted when manually set.
         * See {@link patio.Database#typecastValue}
         * @default true
         */
        typecastOnAssignment:true,

        /**
         * Set to false to prevent errors thrown while type casting a value from being propogated.
         * @default true
         */
        raiseOnTypecastError:true,

        /**
         * Set to false to prevent models from using transactions when saving, deleting, or updating.
         * This applies to the model associations also.
         */
        useTransactions:true,

        /**
         * See {@link patio.Dataset#identifierOutputMethod}
         * @default null
         */
        identifierOutputMethod:null,

        /**
         * See {@link patio.Dataset#identifierInputMethod}
         * @default null
         */
        identifierInputMethod:null,

        /**
         * Set to false to prevent the reload of a model after saving.
         * @default true
         */
        reloadOnSave:true,

        /**
         * Set to false to prevent the reload of a model after updating.
         * @default true
         */
        reloadOnUpdate:true,

        __camelize:false,

        __underscore:false,


        /**
         * The table that this Model represents.
         * <b>READ ONLY</b>
         */
        table:null,

        /**
         * patio  - read only
         *
         * @type patio
         */
        patio:null,


        /**
         * Create a new model initialized with the specified values.
         *
         * @param {Object} values  the values to initialize the model with.
         *
         * @returns {Model} instantiated model initialized with the values passed in.
         */
        create:function(values){
            //load an object from an object
            return new this(values, false);
        },

        _checkTransaction:function(opts, cb){
            if (comb.isFunction(opts)) {
                cb = opts;
                opts = {};
            } else {
                opts = opts || {};
            }
            var ret = new comb.Promise(), retVal = null, errored = false;
            if (this.useTransaction(opts)) {
                this.db.transaction(opts, hitch(this, function(){
                    return comb.when(cb(), function(){
                        retVal = comb.argsToArray(arguments);
                    }, function(){
                        retVal = comb.argsToArray(arguments);
                        errored = true;
                    });
                })).then(hitch(this, function(){
                    ret[errored ? "errback" : "callback"].apply(ret, retVal);
                }), hitch(ret, "errback"));
                return ret;
            } else {
                return comb.when(cb(), hitch(ret, "callback"), hitch(ret, "errback"));
            }
        },

        /**
         * @private
         * Returns a boolean indicating whether or not to use a transaction.
         * @param {Object} [opts] set a transaction property to override the {@link patio.Model#useTransaction}.
         */
        useTransaction:function(opts){
            opts = opts || {};
            return comb.isBoolean(opts.transaction) ? opts.transaction === true : this.useTransactions === true;
        },

        /**
         * @ignore
         */
        getters:{
            /**@lends patio.Model*/

            /**
             * Set to true if this models column names should be use the "underscore" method when sending
             * keys to the database and to "camelize" method on columns returned from the database. If set to false see
             * {@link patio.Model#underscore}.
             * @field
             * @type {Boolean}
             */
            camelize:function(camelize){
                return  this.__camelize;

            },

            /**
             * Set to true if this models column names should be use the "camelize" method when sending
             * keys to the database and to "underscore" method on columns returned from the database. If set to false see
             * {@link patio.Model#underscore}.
             * @field
             * @type {Boolean}
             */
            underscore:function(underscore){
                return this.__underscore;

            }
        },

        /**@ignore*/
        setters:{
            /**@lends patio.Model*/
            /**@ignore*/
            camelize:function(camelize){
                camelize = camelize === true;
                if (camelize) {
                    this.identifierOutputMethod = "camelize";
                    this.identifierInputMethod = "underscore";
                }
                this.__camelize = camelize;
                this.__underscore = !camelize;

            },
            /**@ignore*/
            underscore:function(underscore){
                underscore = underscore === true;
                if (underscore) {
                    this.identifierOutputMethod = "underscore";
                    this.identifierInputMethod = "camelize";
                }
                this.__underscore = underscore;
                this.__camelize = !underscore;

            }
        }
    }

}).as(exports, "Model");

/*Adds a setter to an object*/
var addSetter = function(name, col, setterFunc){
    return function(val){
        var ignore = this.__ignore;
        if (col.primaryKey && !ignore) {
            throw new ModelError("Cannot set primary key of model " + this._static.tableName);
        }
        val = this._typeCastValue(name, val, ignore);
        if (!this.isNew && !ignore) {
            this.__isChanged = true;
            this.__changed[name] = val;
        }
        setterFunc = this["_set" + name.charAt(0).toUpperCase() + name.substr(1)];
        this.__values[name] = comb.isFunction(setterFunc) ? setterFunc.call(this, val) : val;
    };
};

/*Adds a getter to an object*/
var addGetter = function(name){
    return function(){
        var ret = this.__values[name];
        return comb.isUndefined(ret) ? null : ret;
    };
};

var MODELS = new comb.collections.HashTable();

/**@ignore*/
exports.create = function(name, modelOptions){
    !patio && (patio = require("./index"));
    modelOptions = modelOptions || {};
    var modelInstance = modelOptions.instance || {},
        modelGetters = modelInstance.getters || {},
        modelSetters = modelInstance.setters || {},
        modelStatic = modelOptions.static || {},
        modelStaticGetters = modelStatic.getters || {},
        modelStaticSetters = modelStatic.setters || {};
    //do this so we can correctly map the columns
    var outputMethod = (modelStatic.camelize === true || Model.camelize === true) ? "camelize" : (modelStatic.underscore === true || Model.underscore === true) ? "underscore" : modelStatic.identifierOutputMethod;
    var inputMethod = (modelStatic.camelize === true || Model.camelize === true) ? "underscore" : (modelStatic.underscore === true || Model.underscore === true) ? "camelize" : modelStatic.identifierInputMethod;
    //do this so we can correctly map the columns
    var columnOutputTransformMethod = function(val){
        return applyColumnTransformMethod(val, outputMethod);
    };
    var columnInputTransformMethod = function(val){
        return applyColumnTransformMethod(val, inputMethod);
    };

    var db, ds, tableName;
    if (comb.isString(name)) {
        tableName = columnOutputTransformMethod(name);
        db = patio.defaultDatabase;
        ds = db.from(tableName);
    } else if (comb.isInstanceOf(name, patio.Dataset)) {
        ds = name;
        tableName = ds.firstSourceAlias;
        db = ds.db;
    }
    if (!MODELS.contains(db)) {
        MODELS.set(db, {});
        var handle = comb.connect(db, "onDisconnect", function(){
            comb.disconnect(handle);
            MODELS.remove(db);
        });
    }
    //Create the default proto
    var proto = {
        instance:{
            patio:patio,
            __dataset:null,
            _hooks:["save", "update", "remove", "load"],
            __hooks:{pre:{}, post:{}},
            getters:{
                /**@lends patio.Model.prototype*/

                primaryKey:function(){
                    return this._static.primaryKey;
                },

                tableName:function(){
                    return this._static.tableName;
                },

                dataset:function(){
                    return this.__dataset || this._static.dataset;
                },

                db:function(){
                    return this._static.db;
                },

                schema:function(){
                    return this._static.schema;
                },

                columns:function(){
                    return this._static.columns;
                }
            },
            setters:{}
        },
        static:{
            __columns:null,

            __schema:null,

            __primaryKey:null,

            getters:{
                /**@lends patio.Model*/

                /**
                 * The name of the table all instances of the this {@link patio.Model} use.
                 * @field
                 * @type String
                 */
                tableName:function(){
                    return tableName;
                },

                /**
                 * The database all instances of this {@link patio.Model} use.
                 * @field
                 * @type patio.Database
                 */
                db:function(){
                    return db;
                },

                /**
                 * A dataset to use to retrieve instances of this {@link patio.Model{ from the database. The dataset
                 * has the {@link patio.Dataset#rowCb} set to create instances of this model.
                 * @field
                 * @type patio.Dataset
                 */
                dataset:function(){
                    var ds = db.from(tableName);
                    ds.rowCb = hitch(this, function(vals){
                        var ret = new Promise();
                        var m = new this(vals, true);
                        //call the hooks!
                        m._hook("post", "load").then(hitch(ret, "callback", m), hitch(ret, "errback"));
                        return ret;
                    });
                    this.identifierInputMethod && (ds.identifierInputMethod = this.identifierInputMethod);
                    this.identifierOutputMethod && (ds.identifierOutputMethod = this.identifierOutputMethod);
                    return ds;
                },

                /**
                 * A list of columns this models table contains.
                 * @field
                 * @type String[]

                 */
                columns:function(){
                    return this.__columns;
                },

                /**
                 * The schema of this {@link patio.Model}'s table. See {@link patio.Database#schema} for details
                 * on the schema object.
                 * @field
                 * @type Object
                 */
                schema:function(){
                    return this.__schema;
                },

                /**
                 * The primaryKey column/s of this {@link patio.Model}
                 * @field
                 */
                primaryKey:function(){
                    return this.__primaryKey.slice(0);
                },

                /**
                 * A reference to the global {@link patio}.
                 * @field
                 */
                patio:function(){
                    return patio;
                }
            },
            /**@ignore*/
            setters:{}
        }
    };
    var instance = proto.instance,
        getters = instance.getters,
        setters = instance.setters,
        static = proto.static || {},
        staticGetters = static.getters || {},
        staticSetters = static.setters || {};
    //remove these so they dont override our proto
    delete modelInstance.getters;
    delete modelInstance.setters;
    delete modelStatic.getters;
    delete modelStatic.setters;
    //Mixin the column setter/getters
    var ret = new comb.Promise();
    comb.executeInOrder(ds, db,
        function(ds, db){
            return [ds.columns, db.schema(tableName), db.indexes(tableName)];
        }).then(function(values){
            var columns = values[0].map(columnOutputTransformMethod), schema = values[1], indexes = values[2];
            var pks = [];
            for (var i in schema) {
                var col = schema[i];
                var name = columnOutputTransformMethod(i);
                col.primaryKey && pks.push(name);
                getters[name] = addGetter(name);
                setters[name] = addSetter(name, col);
            }
            modelStatic.__columns = columns;
            modelStatic.__schema = schema;
            modelStatic.__primaryKey = pks;
            modelStatic.__indexes = indexes;
            //Define super and mixins
            //By Default we include Query and Association plugins
            var parents = [Model].concat(modelOptions.plugins || []);

            //START MERGE OF PASSED PROTO
            var merge = comb.merge;

            merge(instance, modelInstance);
            merge(getters, modelGetters);
            merge(setters, modelSetters);
            merge(static, modelStatic);
            merge(staticGetters, modelStaticGetters);
            merge(staticSetters, modelStaticSetters);
            //END MERGE OF PASSED PROTO
            //Create return model
            var model = comb.define(parents, proto);
            //mixin pre and post functions
            ["pre", "post"].forEach(function(op){
                var optionsOp = modelOptions[op];
                if (optionsOp) {
                    for (var i in optionsOp) {
                        model[op](i, optionsOp[i]);
                    }
                }
            });
            MODELS.get(db)[tableName] = model;
            ret.callback(model);
        }, comb.hitch(ret, "errback"));
    return ret;
};

var checkAndTransformName = function(name){
    return applyColumnTransformMethod(name, Model.camelize === true ? "camelize" : Model.underscore === true ? "underscore" : null);
};

exports.getModel = function(name, db){
    if (!comb.isInstanceOf(name, Model)) {
        !patio && (patio = require("./index"));
        db = db || patio.defaultDatabase;
        var ret = null;
        if (MODELS.contains(db)) {
            ret = MODELS.get(db)[checkAndTransformName(name)];
        }
    } else {
        ret = name;
    }
    return ret;
};


