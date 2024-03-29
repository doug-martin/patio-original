var comb = require("comb"),
    array = comb.array,
    sql = require("../sql").sql,
    LiteralString = sql.LiteralString,
    Expression = sql.Expression,
    ComplexExpression = sql.ComplexExpression,
    BooleanExpression = sql.BooleanExpression,
    PlaceHolderLiteralString = sql.PlaceHolderLiteralString,
    Identifier = sql.Identifier,
    QualifiedIdentifier = sql.QualifiedIdentifier,
    AliasedExpression = sql.AliasedExpression,
    StringExpression = sql.StringExpression,
    NumericExpression = sql.NumericExpression,
    OrderedExpression = sql.OrderedExpression,
    JoinClause = sql.JoinClause,
    JoinOnClause = sql.JoinOnClause,
    JoinUsingClause = sql.JoinUsingClause,
    ColumnAll = sql.ColumnAll,
    QueryError = require("../errors").QueryError;


var Dataset;


comb.define(null, {
    /**@ignore*/
    instance:{

        /**@lends patio.Dataset.prototype*/

        /**
         * @ignore
         */
        constructor:function(){
            !Dataset && (Dataset = require("../index").Dataset);
            this._super(arguments);
            this._static.CONDITIONED_JOIN_TYPES.forEach(function(type){
                if (!this[type + "Join"]) {
                    this[type + "Join"] = function(){
                        var args = comb.argsToArray(arguments);
                        return this.joinTable.apply(this, [type].concat(args));
                    };
                }

            }, this);
            this._static.UNCONDITIONED_JOIN_TYPES.forEach(function(type){
                if (!this[type + "Join"]) {
                    this[type + "Join"] = function(table){
                        return this.joinTable.apply(this, [type, table]);
                    };
                }

            }, this);
        },


        /**
         * Adds a futher filter to an existing filter using AND. This method is identical to {@link patio.Dataset#filter}
         * except it expects an existing filter.
         *
         * <p>
         *     <b>For parameter types see {@link patio.Dataset#filter}.</b>
         * </p>
         *
         * @example
         * DB.from("table").filter("a").and("b").sql;
         *      //=>SELECT * FROM table WHERE a AND b
         *
         * @throws {patio.QueryError} If no WHERE?HAVING clause exists.
         *
         * @return {patio.Dataset} a cloned dataset with the condtion added to the WHERE/HAVING clause added.
         */
        and:function(){
            var tOpts = this.__opts, clauseObj = tOpts[tOpts.having ? "having" : "where"];
            if (clauseObj) {
                return this.filter.apply(this, arguments);
            } else {
                throw new QueryError("No existing filter found");
            }
        },

        as:function(alias){
            return new AliasedExpression(this, alias);
        },

        /**
         * Adds an alternate filter to an existing WHERE/HAVING using OR.
         *
         * <p>
         *     <b>For parameter types see {@link patio.Dataset#filter}.</b>
         * </p>
         *
         * @example
         *
         * DB.from("items").filter("a").or("b")
         *      //=> SELECT * FROM items WHERE a OR b
         *
         * @throws {patio.QueryError} If no WHERE?HAVING clause exists.
         * @return {patio.Dataset} a cloned dataset with the condtion added to the WHERE/HAVING clause added.
         */
        or:function(){
            var tOpts = this.__opts;
            var clause = (tOpts.having ? "having" : "where"), clauseObj = tOpts[clause];
            if (clauseObj) {
                var args = comb.argsToArray(arguments);
                args = args.length == 1 ? args[0] : args;
                var opts = {};
                opts[clause] = new BooleanExpression("OR", clauseObj, this._filterExpr(args))
                return this.mergeOptions(opts);
            } else {
                throw new QueryError("No existing filter found");
            }
        },

        /**
         * Returns a copy of the dataset with the SQL DISTINCT clause.
         * The DISTINCT clause is used to remove duplicate rows from the
         * output.  If arguments are provided, uses a DISTINCT ON clause,
         * in which case it will only be distinct on those columns, instead
         * of all returned columns.
         *
         * @example
         *
         * DB.from("items").distinct().sqll
         *      //=> SELECT DISTINCT * FROM items
         * DB.from("items").order("id").distinct("id").sql;
         *      //=> SELECT DISTINCT ON (id) * FROM items ORDER BY id
         *
         * @throws {patio.QueryError}  If arguments are given and DISTINCT ON is not supported.
         * @param {...String|...patio.sql.Identifier} args variable number of arguments used to create
         *                                                 the DISTINCT ON clause.
         * @return {patio.Dataset} a cloned dataset with the DISTINCT/DISTINCT ON clause added.
         */
        distinct:function(args){
            args = comb.argsToArray(arguments);
            if (args.length && !this.supportsDistinctOn) {
                throw new QueryError("DISTICT ON is not supported");
            }
            args = args.map(function(a){
                return comb.isString(a) ? new Identifier(a) : a;
            });
            return this.mergeOptions({distinct:args});
        },

        /**
         * Adds an EXCEPT clause using a second dataset object.
         * An EXCEPT compound dataset returns all rows in the current dataset
         * that are not in the given dataset.
         *
         * @example
         *
         * DB.from("items").except(DB.from("other_items")).sql;
         *      //=> SELECT * FROM items EXCEPT SELECT * FROM other_items
         *
         * DB.from("items").except(DB.from("other_items"),
         *                        {all : true, fromSelf : false}).sql;
         *      //=> SELECT * FROM items EXCEPT ALL SELECT * FROM other_items
         *
         * DB.from("items").except(DB.from("other_items"),
         *                        {alias : "i"}).sql;
         *      //=>SELECT * FROM (SELECT * FROM items EXCEPT SELECT * FROM other_items) AS i
         *
         * @throws {patio.QueryError} if the operation is not supported.
         * @param {patio.Dataset} dataset the dataset to use to create the EXCEPT clause.
         * @param {Object} [opts] options to use when creating the EXCEPT clause
         * @param {String|patio.sql.Identifier} [opt.alias] Use the given value as the {@link patio.Dataset#fromSelf} alias.
         * @param {Boolean} [opts.all] Set to true to use EXCEPT ALL instead of EXCEPT, so duplicate rows can occur
         * @param {Boolean} [opts.fromSelf] Set to false to not wrap the returned dataset in a {@link patio.Dataset#fromSelf}, use with care.
         *
         * @return {patio.Dataset} a cloned dataset with the EXCEPT clause added.
         */
        except:function(dataset, opts){
            opts = comb.isUndefined(opts) ? {} : opts;
            if (!comb.isHash(opts)) {
                opts = {all:true};
            }
            if (!this.supportsIntersectExcept) {
                throw new QueryError("EXCEPT not supoorted");
            } else if (opts.hasOwnProperty("all") && !this.supportsIntersectExceptAll) {
                throw new QueryError("EXCEPT ALL not supported");
            }
            return this.compoundClone("except", dataset, opts);
        },

        /**
         * Performs the inverse of {@link patio.Dataset#filter}.  Note that if you have multiple filter
         * conditions, this is not the same as a negation of all conditions. For argument types see
         * {@link patio.Dataset#filter}
         *
         * @example
         *
         * DB.from("items").exclude({category : "software").sql;
         *      //=> SELECT * FROM items WHERE (category != 'software')
         *
         * DB.from("items").exclude({category : 'software', id : 3}).sql;
         *      //=> SELECT * FROM items WHERE ((category != 'software') OR (id != 3))
         * @return {patio.Dataset} a cloned dataset with the excluded conditions applied to the HAVING/WHERE clause.
         */
        exclude:function(){
            var cond = comb.argsToArray(arguments), tOpts = this.__opts;
            var clause = (tOpts["having"] ? "having" : "where"), clauseObj = tOpts[clause];
            cond = cond.length > 1 ? cond : cond[0];
            cond = this._filterExpr.call(this, cond);
            cond = BooleanExpression.invert(cond);
            if (clauseObj) {
                cond = new BooleanExpression("AND", clauseObj, cond)
            }
            var opts = {};
            opts[clause] = cond;
            return this.mergeOptions(opts);
        },

        /**
         * Returns a copy of the dataset with the given conditions applied to it.
         * If the query already has a HAVING clause, then the conditions are applied to the
         * HAVING clause otherwise they are applied to the WHERE clause.
         *
         * @example
         *
         * DB.from("items").filter({id : 3}).sql;
         *      //=> SELECT * FROM items WHERE (id = 3)
         *
         * DB.from("items").filter('price < ?', 100)
         *      //=> SELECT * FROM items WHERE price < 100
         *
         * DB.from("items").filter({id, [1,2,3]}).filter({id : {between : [0, 10]}}).sql;
         *      //=> SELECT
         *               *
         *           FROM
         *               items
         *           WHERE
         *               ((id IN (1, 2, 3)) AND ((id >= 0) AND (id <= 10)))
         *
         * DB.from("items").filter('price < 100');
         *      //=> SELECT * FROM items WHERE price < 100
         *
         * DB.from("items").filter("active").sql;
         *      //=> SELECT * FROM items WHERE active
         *
         * DB.from("items").filter(function(){
         *      return this.price.lt(100);
         * });
         *      //=> SELECT * FROM items WHERE (price < 100)
         *
         * //Multiple filter calls can be chained for scoping:
         * DB.from("items").filter(:category => 'software').filter{price < 100}
         *      //=> SELECT * FROM items WHERE ((category = 'software') AND (price < 100))
         *
         *
         * @param {Object|Array|String|patio.sql.Identifier|patio.sql.BooleanExpression} args filters to apply to the
         *  WHERE/HAVING clause. Description of each:
         *  <ul>
         *      <li>Hash - list of equality/inclusion expressions</li>
         *      <li>Array - depends:
         *          <ul>
         *              <li>If first member is a string, assumes the rest of the arguments
         *                  are parameters and interpolates them into the string.</li>
         *              <li>If all members are arrays of length two, treats the same way
         *                  as a hash, except it allows for duplicate keys to be
         *                  specified.</li>
         *              <li>Otherwise, treats each argument as a separate condition.</li>
         *           </ul>
         *       </li>
         *      <li>String - taken literally</li>
         *      <li>{@link patio.sql.Identifier} - taken as a boolean column argument (e.g. WHERE active)</li>
         *      <li>{@link patio.sql.BooleanExpression} - an existing condition expression,
         *          probably created using the patio.sql methods.
         *       </li>
         *
         * @param {Function} [cb] filter also takes a cb, which should return one of the above argument
         * types, and is treated the same way.  This block is called with an {@link patio.sql} object which can be used to dynaically create expression.  For more details
         * on the sql object see {@link patio.sql}
         *
         * <p>
         *     <b>NOTE:</b>If both a cb and regular arguments are provided, they get ANDed together.
         * </p>
         *
         * @return {patio.Dataset} a cloned dataset with the filter arumgents applied to the WHERE/HAVING clause.
         **/
        filter:function(args, cb){
            args = [this.__opts["having"] ? "having" : "where"].concat(comb.argsToArray(arguments));
            return this._filter.apply(this, args);
        },

        /**
         * @see patio.Dataset#filter
         */
        find:function(){
            var args = [this.__opts["having"] ? "having" : "where"].concat(comb.argsToArray(arguments));
            return this._filter.apply(this, args);
        },

        /**
         * @example
         * DB.from("table").forUpdate()
         *          //=> SELECT * FROM table FOR UPDATE
         * @return {patio.Dataset} a cloned dataset with a "update" lock style.
         */
        forUpdate:function(){
            return this.lockStyle("update");
        },

        /**
         * Returns a copy of the dataset with the source changed. If no
         * source is given, removes all tables.  If multiple sources
         * are given, it is the same as using a CROSS JOIN (cartesian product) between all tables.
         *
         * @example
         * var dataset = DB.from("items");
         *
         * dataset.from().sql;
         *      //=> SELECT *
         *
         * dataset.from("blah").sql
         *      //=> SELECT * FROM blah
         *
         * dataset.from("blah", "foo")
         *      //=> SELECT * FROM blah, foo
         *
         * dataset.from({a:"b"}).sql;
         *      //=> SELECT * FROM a AS b
         *
         * dataset.from(dataset.from("a").group("b").as("c")).sql;
         *          //=> "SELECT * FROM (SELECT * FROM a GROUP BY b) AS c"
         *
         * @param {...String|...patio.sql.Identifier|...patio.Dataset|...Object} [source] tables to select from
         *
         * @return {patio.Dataset} a cloned dataset with the FROM clause overridden.
         */
        from:function(source){
            source = comb.argsToArray(arguments);
            var tableAliasNum = 0, sources = [];
            source.forEach(function(s){
                if (comb.isInstanceOf(s, Dataset)) {
                    sources.push(new AliasedExpression(s, this._datasetAlias(++tableAliasNum)));
                } else if (comb.isHash(s)) {
                    for (var i in s) {
                        sources.push(new AliasedExpression(new Identifier(i), s[i]));
                    }
                } else if (comb.isString(s)) {
                    sources.push(this.stringToIdentifier(s))
                } else {
                    sources.push(s);
                }
            }, this);

            var o = {from:sources.length ? sources : null}
            if (tableAliasNum) {
                o.numDatasetSources = tableAliasNum;
            }
            return this.mergeOptions(o)
        },

        /**
         * Returns a dataset selecting from the current dataset.
         * Supplying the alias option controls the alias of the result.
         *
         * @example
         *
         * ds = DB.from("items").order("name").select("id", "name")
         *      //=> SELECT id,name FROM items ORDER BY name
         *
         * ds.fromSelf().sql;
         *      //=> SELECT * FROM (SELECT id, name FROM items ORDER BY name) AS t1
         *
         * ds.fromSelf({alias : "foo"}).sql;
         *      //=> SELECT * FROM (SELECT id, name FROM items ORDER BY name) AS foo
         *
         * @param {Object} [opts] options
         * @param {String|patio.sql.Identifier} [opts.alias] alias to use
         *
         * @return {patio.Dataset} a cloned dataset with the FROM clause set as the current dataset.
         */
        fromSelf:function(opts){
            opts = comb.isUndefined(opts) ? {} : opts;
            var fs = {};
            var nonSqlOptions = this._static.NON_SQL_OPTIONS;
            Object.keys(this.__opts).forEach(function(k){
                if (nonSqlOptions.indexOf(k) == -1) {
                    fs[k] = null;
                }
            });
            return this.mergeOptions(fs).from(opts["alias"] ? this.as(opts["alias"]) : this);
        },

        /**
         * Match any of the columns to any of the patterns. The terms can be
         * strings (which use LIKE) or regular expressions (which are only
         * supported on MySQL and PostgreSQL).  Note that the total number of
         * pattern matches will be columns[].length * terms[].length,
         * which could cause performance issues.
         *
         * @example
         *
         * DB.from("items").grep("a", "%test%").sql;
         *      //=> SELECT * FROM items WHERE (a LIKE '%test%');
         *
         * DB.from("items").grep(["a", "b"], ["%test%" "foo"]).sql;
         *      //=> SELECT * FROM items WHERE ((a LIKE '%test%') OR (a LIKE 'foo') OR (b LIKE '%test%') OR (b LIKE 'foo'))
         *
         * DB.from("items").grep(['a', 'b'], ["%foo%", "%bar%"], {allPatterns : true}).sql;
         *      //=> SELECT * FROM a WHERE (((a LIKE '%foo%') OR (b LIKE '%foo%')) AND ((a LIKE '%bar%') OR (b LIKE '%bar%')))
         *
         * DB.from("items").grep(["a", "b"], ['%foo%", "%bar%", {allColumns : true})sql;
         *      //=> SELECT * FROM a WHERE (((a LIKE '%foo%') OR (a LIKE '%bar%')) AND ((b LIKE '%foo%') OR (b LIKE '%bar%')))
         *
         * DB.from("items").grep(["a", "b"], ["%foo%", "%bar%"], {allPatterns : true, allColumns : true}).sql;
         *      //=> SELECT * FROM a WHERE ((a LIKE '%foo%') AND (b LIKE '%foo%') AND (a LIKE '%bar%') AND (b LIKE '%bar%'))
         *
         * @param {String[]|patio.sql.Identifier[]} columns columns to search
         * @param {String|RegExp} patterns patters to search with
         * @param {Object} [opts] options to use when searching. NOTE If both allColumns and allPatterns are true, all columns must match all patterns
         * @param {Boolean} [opts.allColumns] All columns must be matched to any of the given patterns.
         * @param {Boolean} [opts.allPatterns] All patterns must match at least one of the columns.
         * @param {Boolean} [opts.caseInsensitive] Use a case insensitive pattern match (the default is
         *                      case sensitive if the database supports it).
         * @return {patio.Dataset} a dataset with the LIKE clauses added
         */

        grep:function(columns, patterns, opts){
            opts = comb.isUndefined(opts) ? {} : opts;
            var conds;
            if (opts.hasOwnProperty("allPatterns")) {
                conds = array.toArray(patterns).map(function(pat){
                    return BooleanExpression.fromArgs(
                        [(opts.allColumns ? "AND" : "OR")]
                            .concat(array.toArray(columns)
                            .map(function(c){
                                return StringExpression.like(c, pat, opts);
                            })));
                });
                return this.filter(BooleanExpression.fromArgs([opts.allPatterns ? "AND" : "OR"].concat(conds)));
            } else {
                conds = array.toArray(columns)
                    .map(function(c){
                        return BooleanExpression.fromArgs(["OR"].concat(array.toArray(patterns).map(function(pat){
                            return StringExpression.like(c, pat, opts);
                        })));
                    });
                return this.filter(BooleanExpression.fromArgs([opts.allColumns ? "AND" : "OR"].concat(conds)));
            }
        },

        /**
         * @see patio.Dataset#grep
         */
        like:function(){
            return this.grep.apply(this, arguments);
        },


        /**
         * Returns a copy of the dataset with the results grouped by the value of
         * the given columns.
         * @example
         *   DB.from("items").group("id")
         *          //=>SELECT * FROM items GROUP BY id
         *   DB.from("items").group("id", "name")
         *          //=> SELECT * FROM items GROUP BY id, name
         * @param {String...|patio.sql.Identifier...} columns columns to group by.
         *
         * @return {patio.Dataset} a cloned dataset with the GROUP BY clause added.
         **/
        group:function(columns){
            columns = comb.argsToArray(arguments);
            return this.mergeOptions({group:(array.compact(columns).length == 0 ? null : columns.map(function(c){
                return comb.isString(c) ? new Identifier(c) : c;
            }))});
        },

        /**
         * @see patio.Dataset#group
         */
        groupBy:function(){
            return this.group.apply(this, arguments);
        },


        /**
         * Returns a dataset grouped by the given column with count by group.
         * Column aliases may be supplied, and will be included in the select clause.
         *
         * @example
         *
         * DB.from("items").groupAndCount("name").all()
         *      //=> SELECT name, count(*) AS count FROM items GROUP BY name
         *      //=> [{name : 'a', count : 1}, ...]
         *
         * DB.from("items").groupAndCount("first_name", "last_name").all()
         *      //SELECT first_name, last_name, count(*) AS count FROM items GROUP BY first_name, last_name
         *      //=> [{first_name : 'a', last_name : 'b', count : 1}, ...]
         *
         * DB.from("items").groupAndCount("first_name___name").all()
         *      //=> SELECT first_name AS name, count(*) AS count FROM items GROUP BY first_name
         *      //=> [{name : 'a', count:1}, ...]
         * @param {String...|patio.sql.Identifier...} columns columns to croup and count on.
         *
         * @return {patio.Dataset} a cloned dataset with the GROUP clause and count added.
         */
        groupAndCount:function(columns){
            columns = comb.argsToArray(arguments);
            var group = this.group.apply(this, columns.map(function(c){
                return this._unaliasedIdentifier(c);
            }, this));
            return group.select.apply(group, columns.concat([this._static.COUNT_OF_ALL_AS_COUNT]));

        },

        /**
         * Returns a copy of the dataset with the HAVING conditions changed. See {@link patio.Dataset#filter} for argument types.
         *
         * @example
         * DB.from("items").group("sum").having({sum : 10}).sql;
         *      //=> SELECT * FROM items GROUP BY sum HAVING (sum = 10)
         *
         * @return {patio.Dataset} a cloned dataset with HAVING clause changed or added.
         **/
        having:function(){
            var cond = comb.argsToArray(arguments).map(function(s){
                return comb.isString(s) && s !== '' ? this.stringToIdentifier(s) : s
            }, this);
            return this._filter.apply(this, ["having"].concat(cond));
        },

        /**
         * Adds an INTERSECT clause using a second dataset object.
         * An INTERSECT compound dataset returns all rows in both the current dataset
         * and the given dataset.
         *
         * @example
         *
         * DB.from("items").intersect(DB.from("other_items")).sql;
         *   //=> SELECT * FROM (SELECT * FROM items INTERSECT SELECT * FROM other_items) AS t1
         *
         * DB.from("items").intersect(DB.from("other_items"), {all : true, fromSelf : false}).sql;
         *   //=> SELECT * FROM items INTERSECT ALL SELECT * FROM other_items
         *
         * DB.from("items").intersect(DB.from("other_items"), {alias : "i"}).sql;
         *   //=> SELECT * FROM (SELECT * FROM items INTERSECT SELECT * FROM other_items) AS i
         *
         * @throws {patio.QueryError} if the operation is not supported.
         * @param  {patio.Dataset} dataset the dataset to intersect
         * @param  {Object} [opts] options
         * @param {String|patio.sql.Identifier} [opts.alias] Use the given value as the {@link patio.Dataset#fromSelf} alias
         * @param {Boolean} [opts.all] Set to true to use INTERSECT ALL instead of INTERSECT, so duplicate rows can occur
         * @param {Boolean} [opts.fromSelf] Set to false to not wrap the returned dataset in a {@link patio.Dataset#fromSelf}.
         *
         * @return {patio.Dataset} a cloned dataset with the INTERSECT clause.
         **/
        intersect:function(dataset, opts){
            opts = comb.isUndefined(opts) ? {} : opts;
            if (!comb.isHash(opts)) {
                opts = {all:opts};
            }
            if (!this.supportsIntersectExcept) {
                throw new QueryError("INTERSECT not supported");
            } else if (opts.all && !this.supportsIntersectExceptAll) {
                throw new QueryError("INTERSECT ALL not supported");
            }
            return this.compoundClone("intersect", dataset, opts);
        },

        /**
         * Inverts the current filter.
         *
         * @example
         * DB.from("items").filter({category : 'software'}).invert()
         *      //=> SELECT * FROM items WHERE (category != 'software')
         *
         * @example
         * DB.from("items").filter({category : 'software', id : 3}).invert()
         *      //=> SELECT * FROM items WHERE ((category != 'software') OR (id != 3))
         *
         * @return {patio.Dataset} a cloned dataset with the filter inverted.
         **/
        invert:function(){
            var having = this.__opts.having, where = this.__opts.where;
            if (!(having || where)) {
                throw new QueryError("No current filter");
            }
            var o = {}
            if (having) {
                o.having = BooleanExpression.invert(having);
            }
            if (where) {
                o.where = BooleanExpression.invert(where);
            }
            return this.mergeOptions(o);
        },

        /**
         * Returns a cloned dataset with an inner join applied.
         *
         * @see patio.Dataset#joinTable
         */
        join:function(){
            return this.innerJoin.apply(this, arguments);
        },

        /**
         * Returns a joined dataset.  Uses the following arguments:
         *
         * @example
         *
         * DB.from("items").joinTable("leftOuter", "categories", [["categoryId", "id"],["categoryId", [1, 2, 3]]]).sql;
         *      //=>'SELECT
         *             *
         *            FROM
         *              `items`
         *                  LEFT OUTER JOIN
         *              `categories` ON (
         *                          (`categories`.`categoryId` = `items`.`id`)
         *                              AND
         *                          (`categories`.`categoryId` IN (1,2, 3))
         *                          )
         * DB.from("items").leftOuter("categories", [["categoryId", "id"],["categoryId", [1, 2, 3]]]).sql;
         *      //=>'SELECT
         *             *
         *            FROM
         *              `items`
         *                  LEFT OUTER JOIN
         *              `categories` ON (
         *                          (`categories`.`categoryId` = `items`.`id`)
         *                              AND
         *                          (`categories`.`categoryId` IN (1,2, 3))
         *                          )
         *
         * DB.from("items").leftOuterJoin("categories", {categoryId:"id"}).sql
         *          //=> SELECT * FROM "items" LEFT OUTER JOIN "categories" ON ("categories"."categoryId" = "items"."id")
         *
         * DB.from("items").rightOuterJoin("categories", {categoryId:"id"}).sql
         *          //=> SELECT * FROM "items" RIGHT OUTER JOIN "categories" ON ("categories"."categoryId" = "items"."id")
         *
         * DB.from("items").fullOuterJoin("categories", {categoryId:"id"}).sql
         *          //=> SELECT * FROM "items" FULL OUTER JOIN "categories" ON ("categories"."categoryId" = "items"."id")
         *
         * DB.from("items").innerJoin("categories", {categoryId:"id"}).sql
         *          //=> SELECT * FROM "items" INNER JOIN "categories" ON ("categories"."categoryId" = "items"."id")
         *
         * DB.from("items").leftJoin("categories", {categoryId:"id"}).sql
         *          //=> SELECT * FROM "items" LEFT JOIN "categories" ON ("categories"."categoryId" = "items"."id")
         *
         * DB.from("items").rightJoin("categories", {categoryId:"id"}).sql
         *          //=> SELECT * FROM "items" RIGHT JOIN "categories" ON ("categories"."categoryId" = "items"."id")
         *
         * DB.from("items").fullJoin("categories", {categoryId:"id"}).sql
         *          //=> SELECT * FROM "items" FULL JOIN "categories" ON ("categories"."categoryId" = "items"."id")
         *
         * DB.from("items").naturalJoin("categories").sql
         *          //=> SELECT * FROM "items" NATURAL JOIN "categories"
         *
         * DB.from("items").naturalLeftJoin("categories").sql
         *          //=> SELECT * FROM "items" NATURAL LEFT JOIN "categories"
         *
         * DB.from("items").naturalRightJoin("categories").sql
         *          //=> SELECT * FROM "items" NATURAL RIGHT JOIN "categories"
         *
         * DB.from("items").naturalFullJoin("categories").sql
         *          //=> SELECT * FROM "items" NATURAL FULL JOIN "categories"'
         *
         * DB.from("items").crossJoin("categories").sql
         *          //=> SELECT * FROM "items" CROSS JOIN "categories"
         *
         * @param {String} type the type of join to do.
         * @param {String|patio.sql.Identifier|patio.Dataset|Object} table depends on the type.
         *  <ul>
         *      <li>{@link patio.Dataset} - a subselect is performed with an alias</li>
         *      <li>Object - an object that has a tableName property.</li>
         *      <li>String|{@link patio.sql.Identifier}  - the name of the table</li>
         *  </ul>
         * @param [expr] - depends on type
         * <ul>
         *     <li>Object|Array of two element arrays - Assumes key (1st arg) is column of joined table (unless already
         *     qualified), and value (2nd arg) is column of the last joined or primary table (or the
         *     implicitQualifier option</li>.
         *     <li>Array - If all members of the array are string or {@link patio.sql.Identifier}, considers
         *     them as columns and uses a JOIN with a USING clause.  Most databases will remove duplicate columns from
         *     the result set if this is used.</li>
         *     <li>null|undefined(not passed in) - If a cb is not given, doesn't use ON or USING, so the JOIN should be a NATURAL
         *     or CROSS join. If a block is given, uses an ON clause based on the block, see below.</li>
         *     <li>Everything else - pretty much the same as a using the argument in a call to {@link patio.Dataset#filter},
         *     so strings are considered literal, {@link patio.sql.Identifiers} specify boolean columns, and patio.sql
         *      expressions can be used. Uses a JOIN with an ON clause.</li>
         * </ul>
         * @param {Object} options an object of options.
         * @param {String|patio.sql.Identifier} [options.tableAlias=undefined] the name of the table's alias when joining, necessary for joining
         *     to the same table more than once.  No alias is used by default.
         * @param {String|patio.sql.Identifier} [options.implicitQualifier=undefined] The name to use for qualifying implicit conditions.  By default,
         *     the last joined or primary table is used.
         * @param {Function} [cb]  cb - The cb argument should only be given if a JOIN with an ON clause is used,
         *   in which case it is called with
         *   <ul>
         *       <li>table alias/name for the table currently being joined</li>
         *       <li> the table alias/name for the last joined (or first table)
         *       <li>array of previous</li>
         *   </ul>
         *   the cb should return an expression to be used in the ON clause.
         *
         * @return {patio.Dataset} a cloned dataset joined using the arguments.
         */

        joinTable:function(type, table, expr, options, cb){
            var args = comb.argsToArray(arguments);
            if (comb.isFunction(args[args.length - 1])) {
                cb = args[args.length - 1];
                args.pop();
            } else {
                cb = null;
            }
            type = args.shift(), table = args.shift(), expr = args.shift(), options = args.shift();
            expr = comb.isUndefined(expr) ? null : expr, options = comb.isUndefined(options) ? {} : options;

            var h;
            var usingJoin = comb.isArray(expr) && expr.length && expr.every(function(x){
                return comb.isString(x) || comb.isInstanceOf(x, Identifier)
            });
            if (usingJoin && !this.supportsJoinUsing) {
                h = {};
                expr.forEach(function(s){
                    h[s] = s;
                });
                return this.joinTable(type, table, h, options);
            }
            var tableAlias, lastAlias;
            if (comb.isHash(options)) {
                tableAlias = options.tableAlias;
                lastAlias = options.implicitQualifier;
            } else if (comb.isString(options) || comb.isInstanceOf(options, Identifier)) {
                tableAlias = options;
                lastAlias = null;
            } else {
                throw new QueryError("Invalid options format for joinTable %j4", [options]);
            }
            var tableAliasNum, tableName;
            if (comb.isInstanceOf(table, Dataset)) {
                if (!tableAlias) {
                    tableAliasNum = (this.__opts.numDatasetSources || 0) + 1;
                    tableAlias = this._datasetAlias(tableAliasNum);
                }
                tableName = tableAlias;
            } else {
                if (table.hasOwnProperty("tableName")) {
                    table = table.tableName;
                }
                if (comb.isArray(table)) {
                    table = table.map(this.stringToIdentifier, this);
                } else {
                    table = comb.isString(table) ? this.stringToIdentifier(table) : table;
                    var parts = this._splitAlias(table), implicitTableAlias = parts[1];
                    table = parts[0]
                    tableAlias = tableAlias || implicitTableAlias;
                    tableName = tableAlias || table;
                }
            }
            var join;
            if (!expr && !cb) {
                join = new JoinClause(type, table, tableAlias);
            } else if (usingJoin) {
                if (cb) {
                    throw new QueryError("cant use a cb if an array is given");
                }
                join = new JoinUsingClause(expr, type, table, tableAlias);
            } else {
                lastAlias = lastAlias || this.__opts["lastJoinedTable"] || this.firstSourceAlias;
                if (Expression.isConditionSpecifier(expr)) {
                    var newExpr = [];
                    for (var i in expr) {
                        var val = expr[i];
                        if (comb.isArray(val) && val.length == 2) {
                            i = val[0], val = val[1];
                        }
                        var k = this.qualifiedColumnName(i, tableName), v;
                        if (comb.isInstanceOf(val, Identifier)) {
                            v = val.qualify(lastAlias);
                        } else {
                            v = val;
                        }
                        newExpr.push([k, v]);
                    }
                    expr = newExpr;
                }
                if (comb.isFunction(cb)) {
                    var expr2 = cb.apply(sql, [tableName, lastAlias, this.__opts.join || []]);
                    expr = expr ? new BooleanExpression("AND", expr, expr2) : expr2;
                }
                join = new JoinOnClause(expr, type, table, tableAlias);
            }
            var opts = {join:(this.__opts.join || []).concat([join]), lastJoinedTable:tableName};
            if (tableAliasNum) {
                opts.numDatasetSources = tableAliasNum;
            }
            return this.mergeOptions(opts);

        },

        /**
         * If given an integer, the dataset will contain only the first l results.
         If a second argument is given, it is used as an offset. To use
         * an offset without a limit, pass null as the first argument.
         *
         * @example
         *
         * DB.from("items").limit(10)
         *      //=> SELECT * FROM items LIMIT 10
         * DB.from("items").limit(10, 20)
         *      //=> SELECT * FROM items LIMIT 10 OFFSET 20
         * DB.from("items").limit([3, 7]).sql
         *      //=> SELECT * FROM items LIMIT 5 OFFSET 3');
         * DB.from("items").limit(null, 20)
         *      //=> SELECT * FROM items OFFSET 20
         *
         * DB.from("items").limit('6', sql['a() - 1']).sql
         *      => 'SELECT * FROM items LIMIT 6 OFFSET a() - 1');
         *
         * @param {Number|String|Number[]} limit the limit to apply
         * @param {Number|String|patio.sql.LiteralString} offset the offset to apply
         *
         * @return {patio.Dataset}  a cloned dataset witht the LIMIT and OFFSET applied.
         **/
        limit:function(limit, offset){
            if (this.__opts.sql) {
                return this.fromSelf().limit(limit, offset);
            }
            if (comb.isArray(limit) && limit.length == 2) {
                offset = limit[0];
                limit = limit[1] - limit[0] + 1;
            }
            if (comb.isString(limit) || comb.isInstanceOf(limit, LiteralString)) {
                limit = parseInt("" + limit, 10);
            }
            if (comb.isNumber(limit) && limit < 1) {
                throw new QueryError("Limit must be >= 1");
            }
            var opts = {limit:limit};
            if (offset) {
                if (comb.isString(offset) || comb.isInstanceOf(offset, LiteralString)) {
                    offset = parseInt("" + offset, 10);
                    isNaN(offset) && (offset = 0);
                }
                if (comb.isNumber(offset) && offset < 0) {
                    throw new QueryError("Offset must be >= 0");
                }
                opts.offset = offset;
            }
            return this.mergeOptions(opts);
        },

        /**
         *
         * Returns a cloned dataset with a not equal expression added to the WHERE
         * clause.
         *
         * @example
         *  DB.from("test").neq({x : 1});
         *          //=> SELECT * FROM test WHERE (x != 1)
         *  DB.from("test").neq({x : 1, y : 10});
         *          //=> SELECT * FROM test WHERE ((x != 1) AND (y != 10))
         *
         * @param {Object} obj object used to create the not equal expression
         *
         * @return {patio.Dataset} a cloned dataset with the not equal expression added to the WHERE clause.
         */
        neq:function(obj){
            return this.filter(this.__createBoolExpression("neq", obj));
        },

        /**
         *
         * Returns a cloned dataset with an equal expression added to the WHERE
         * clause.
         *
         * @example
         *  DB.from("test").eq({x : 1});
         *          //=> SELECT * FROM test WHERE (x = 1)
         *  DB.from("test").eq({x : 1, y : 10});
         *          //=> SELECT * FROM test WHERE ((x = 1) AND (y = 10))
         *
         * @param {Object} obj object used to create the equal expression
         *
         * @return {patio.Dataset} a cloned dataset with the equal expression added to the WHERE clause.
         */
        eq:function(obj){
            return this.filter(this.__createBoolExpression("eq", obj));
        },

        /**
         *
         * Returns a cloned dataset with a greater than expression added to the WHERE
         * clause.
         *
         * @example
         *  DB.from("test").gt({x : 1});
         *          //=> SELECT * FROM test WHERE (x > 1)
         *  DB.from("test").gt({x : 1, y : 10});
         *          //=> SELECT * FROM test WHERE ((x > 1) AND (y > 10))
         *
         * @param {Object} obj object used to create the greater than expression.
         *
         * @return {patio.Dataset} a cloned dataset with the greater than expression added to the WHERE clause.
         */
        gt:function(obj){
            return this.filter(this.__createBoolExpression("gt", obj));
        },

        /**
         *
         * Returns a cloned dataset with a less than expression added to the WHERE
         * clause.
         *
         * @example
         *  DB.from("test").lt({x : 1});
         *          //=> SELECT * FROM test WHERE (x < 1)
         *  DB.from("test").lt({x : 1, y : 10});
         *          //=> SELECT * FROM test WHERE ((x < 1) AND (y < 10))
         *
         * @param {Object} obj object used to create the less than expression.
         *
         * @return {patio.Dataset} a cloned dataset with the less than expression added to the WHERE clause.
         */
        lt:function(obj){
            return this.filter(this.__createBoolExpression("lt", obj));
        },

        /**
         * Returnes a cloned dataset with the IS NOT expression added to the WHERE
         * clause.
         *
         * @example
         *
         * DB.from("test").isNot({boolFlag : null});
         *      => SELECT * FROM test WHERE (boolFlag IS NOT NULL);
         * DB.from("test").isNot({boolFlag : false, otherFlag : true, name : null});
         *      => SELECT * FROM test WHERE ((boolFlag IS NOT FALSE) AND (otherFlag IS NOT TRUE) AND (name IS NOT NULL));
         *
         * @param {Object} obj object used to create the IS NOT expression for.
         *
         * @return {patio.Dataset} a cloned dataset with the IS NOT expression added to the WHERE clause.
         *
         */
        isNot:function(obj){
            return this.filter(this.__createBoolExpression("isNot", obj));
        },

        /**
         * Returnes a cloned dataset with the IS expression added to the WHERE
         * clause.
         *
         * @example
         *
         * DB.from("test").is({boolFlag : null});
         *      => SELECT * FROM test WHERE (boolFlag IS NULL);
         * DB.from("test").is({boolFlag : false, otherFlag : true, name : null});
         *      => SELECT * FROM test WHERE ((boolFlag IS FALSE) AND (otherFlag IS TRUE) AND (name IS NULL));
         *
         * @param {Object} obj object used to create the IS expression for.
         *
         * @return {patio.Dataset} a cloned dataset with the IS expression added to the WHERE clause.
         *
         */
        is:function(obj){
            return this.filter(this.__createBoolExpression("is", obj));
        },

        /**
         * Returnes a cloned dataset with the IS NOT NULL boolean expression added to the WHERE
         * clause.
         *
         * @example
         *
         * DB.from("test").isNotNull("boolFlag");
         *      => SELECT * FROM test WHERE (boolFlag IS NOT NULL);
         * DB.from("test").isNotNull("boolFlag", "otherFlag");
         *      => SELECT * FROM test WHERE (boolFlag IS NOT NULL AND otherFlag IS NOT NULL);
         *
         * @param {String...} arr variable number of arguments to create an IS NOT NULL expression for.
         *
         * @return {patio.Dataset} a cloned dataset with the IS NOT NULL expression added to the WHERE clause.
         *
         */
        isNotNull:function(arr){
            arr = this.__arrayToConditionSpecifier(comb.argsToArray(arguments), null);
            return this.filter(this.__createBoolExpression("isNot", arr));
        },

        /**
         * Returnes a cloned dataset with the IS NULL boolean expression added to the WHERE
         * clause.
         *
         * @example
         *
         * DB.from("test").isNull("boolFlag");
         *      => SELECT * FROM test WHERE (boolFlag IS NULL);
         * DB.from("test").isNull("boolFlag", "otherFlag");
         *      => SELECT * FROM test WHERE (boolFlag IS NULL AND otherFlag IS NULL);
         *
         * @param {String...} arr variable number of arguments to create an IS NULL expression for.
         *
         * @return {patio.Dataset} a cloned dataset with the IS NULL expression added to the WHERE clause.
         *
         */
        isNull:function(arr){
            arr = this.__arrayToConditionSpecifier(comb.argsToArray(arguments), null);
            return this.filter(this.__createBoolExpression("is", arr));
        },

        /**
         * Returnes a cloned dataset with the IS NOT TRUE boolean expression added to the WHERE
         * clause.
         *
         * @example
         *
         * DB.from("test").isNotTrue("boolFlag");
         *      => SELECT * FROM test WHERE (boolFlag IS NOT TRUE);
         * DB.from("test").isNotTrue("boolFlag", "otherFlag");
         *      => SELECT * FROM test WHERE (boolFlag IS NOT TRUE AND otherFlag IS NOT TRUE);
         *
         * @param {String...} arr variable number of arguments to create an IS NOT TRUE expression for.
         *
         * @return {patio.Dataset} a cloned dataset with the IS NOT TRUE expression added to the WHERE clause.
         *
         */
        isNotTrue:function(arr){
            arr = this.__arrayToConditionSpecifier(comb.argsToArray(arguments), true);
            return this.filter(this.__createBoolExpression("isNot", arr));
        },

        /**
         * Returnes a cloned dataset with the IS TRUE boolean expression added to the WHERE
         * clause.
         *
         * @example
         *
         * DB.from("test").isTrue("boolFlag");
         *      => SELECT * FROM test WHERE (boolFlag IS TRUE);
         * DB.from("test").isTrue("boolFlag", "otherFlag");
         *      => SELECT * FROM test WHERE (boolFlag IS TRUE AND otherFlag IS TRUE);
         *
         * @param {String...} arr variable number of arguments to create an IS TRUE expression for.
         *
         * @return {patio.Dataset} a cloned dataset with the IS TRUE expression added to the WHERE clause.
         *
         */
        isTrue:function(arr){
            arr = this.__arrayToConditionSpecifier(comb.argsToArray(arguments), true);
            return this.filter(this.__createBoolExpression("is", arr));
        },

        /**
         * Returnes a cloned dataset with the IS NOT FALSE boolean expression added to the WHERE
         * clause.
         *
         * @example
         *
         * DB.from("test").isNotFalse("boolFlag");
         *      => SELECT * FROM test WHERE (boolFlag IS NOT FALSE);
         * DB.from("test").isNotFalse("boolFlag", "otherFlag");
         *      => SELECT * FROM test WHERE (boolFlag IS NOT FALSE AND otherFlag IS NOT FALSE);
         * @param {String...} arr variable number of arguments to create an IS NOT FALSE expression for.
         *
         * @return {patio.Dataset} a cloned dataset with the IS NOT FALSE expression added to the WHERE clause.
         *
         */
        isNotFalse:function(arr){
            arr = this.__arrayToConditionSpecifier(comb.argsToArray(arguments), false);
            return this.filter(this.__createBoolExpression("isNot", arr));
        },

        /**
         * Returnes a cloned dataset with the IS FALSE boolean expression added to the WHERE
         * clause.
         *
         * @example
         *
         * DB.from("test").isFalse("boolFlag");
         *      => SELECT * FROM test WHERE (boolFlag IS FALSE);
         * DB.from("test").isFalse("boolFlag", "otherFlag");
         *      => SELECT * FROM test WHERE (boolFlag IS FALSE AND otherFlag IS FALSE);
         * @param {String...} arr variable number of arguments to create an IS FALSE expression for.
         *
         * @return {patio.Dataset} a cloned dataset with the IS FALSE expression added to the WHERE clause.
         *
         */
        isFalse:function(arr){
            arr = this.__arrayToConditionSpecifier(comb.argsToArray(arguments), false);
            return this.filter(this.__createBoolExpression("is", arr));
        },

        /**
         *
         * Returns a cloned dataset with a greater than or equal to expression added to the WHERE
         * clause.
         *
         * @example
         *  DB.from("test").gte({x : 1});
         *          //=> SELECT * FROM test WHERE (x >= 1)
         *  DB.from("test").gte({x : 1, y : 10});
         *          //=> SELECT * FROM test WHERE ((x >= 1) AND (y >= 10))
         *
         * @param {Object} obj object used to create the greater than or equal to expression.
         *
         * @return {patio.Dataset} a cloned dataset with the greater than or equal to expression added to the WHERE clause.
         */
        gte:function(arr){
            arr = this.__arrayToConditionSpecifier(comb.argsToArray(arguments), "gte");
            return this.filter(this.__createBoolExpression("gte", arr));
        },

        /**
         *
         * Returns a cloned dataset with a less than or equal to expression added to the WHERE
         * clause.
         *
         * @example
         *  DB.from("test").gte({x : 1});
         *          //=> SELECT * FROM test WHERE (x <= 1)
         *  DB.from("test").gte({x : 1, y : 10});
         *          //=> SELECT * FROM test WHERE ((x <= 1) AND (y <= 10))
         *
         * @param {Object} obj object used to create the less than or equal to expression.
         *
         * @return {patio.Dataset} a cloned dataset with the less than or equal to expression added to the WHERE clause.
         */
        lte:function(obj){
            arr = this.__arrayToConditionSpecifier(comb.argsToArray(arguments), "lte");
            return this.filter(this.__createBoolExpression("lte", obj));
        },

        /**
         * Returns a cloned dataset with a between clause added
         * to the where clause.
         *
         * @example
         *  ds.notBetween({x:[1, 2]}).sql;
         *          //=> SELECT * FROM test WHERE ((x >= 1) OR (x <= 2))
         *
         *  ds.find({x:{notBetween:[1, 2]}}).sql;
         *          //=> SELECT * FROM test WHERE ((x >= 1) OR (x <= 2))
         * @param {Object} obj object where the key is the column and the value is an array where the first element
         *                     is the item to be greater than or equal to than and the second item is less than or equal to than.
         *
         * @return {patio.Dataset} a cloned dataset with a between clause added
         * to the where clause.
         */
        between:function(obj){
            return this.filter(this.__createBetweenExpression(obj));
        },

        /**
         * Returns a cloned dataset with a not between clause added
         * to the where clause.
         *
         * @example
         *  ds.notBetween({x:[1, 2]}).sql;
         *          //=> SELECT * FROM test WHERE ((x < 1) OR (x > 2))
         *
         *  ds.find({x:{notBetween:[1, 2]}}).sql;
         *          //=> SELECT * FROM test WHERE ((x < 1) OR (x > 2))
         * @param {Object} obj object where the key is the column and the value is an array where the first element
         *                     is the item to be less than and the second item is greater than.
         *
         * @return {patio.Dataset} a cloned dataset with a not between clause added
         * to the where clause.
         */
        notBetween:function(obj){
            return this.filter(this.__createBetweenExpression(obj, true));
        },

        /**
         * Returns a cloned dataset with the given lock style.  If style is a
         * string, it will be used directly.Currently "update" is respected
         * by most databases, and "share" is supported by some.
         *
         * @example
         * DB.from("items").lockStyle('FOR SHARE') # SELECT * FROM items FOR SHARE
         *
         * @param {String} style the lock style to use.
         *
         * @return {patio.Dataset} a cloned datase with the given lock style.
         **/
        lockStyle:function(style){
            return this.mergeOptions({lock:style});
        },

        /**
         * Returns a copy of the dataset with the order changed. If the dataset has an
         * existing order, it is ignored and overwritten with this order. If null is given
         * the returned dataset has no order. This can accept multiple arguments
         * of varying kinds, such as SQL functions.  This also takes a function similar
         * to {@link patio.Dataset#filter}
         *
         * @example
         *
         *  DB.from("items").order("name")
         *          //=> SELECT * FROM items ORDER BY name
         *
         *  DB.from("items").order("a", "b")
         *          //=> SELECT * FROM items ORDER BY a, b
         *
         *  DB.from("items").order(sql.literal('a + b'))
         *          //=> SELECT * FROM items ORDER BY a + b
         *
         *  DB.from("items").order(sql.identifier("a").plus("b"))
         *          //=> SELECT * FROM items ORDER BY (a + b)
         *
         *  DB.from("items").order(sql.identifier("name").desc())
         *          //=> SELECT * FROM items ORDER BY name DESC
         *
         *  DB.from("items").order(sql.identifier("name").asc({nulls : "last"))
         *          //=> SELECT * FROM items ORDER BY name ASC NULLS LAST
         *
         *  DB.from("items").order(function(){
         *          return this.sum("name").desc();
         *  }); //=> SELECT * FROM items ORDER BY sum(name) DESC
         *
         *  DB.from("items").order(null)
         *          //=>SELECT * FROM items
         *  @params arg variable number of arguments similar to {@link patio.Dataset#filter}
         *
         *  @return {patio.Dataset} a cloned dataset with the order changed.
         * */
        order:function(args){
            args = comb.argsToArray(arguments);
            var order = [];
            args = array.compact(args).length ? args : null;
            if (args) {
                args.forEach(function(a){
                    if (comb.isString(a)) {
                        order.push(this.stringToIdentifier(a));
                    } else if (comb.isFunction(a)) {
                        var res = a.apply(sql, [sql]);
                        order = order.concat(comb.isArray(res) ? res : [res]);
                    } else {
                        order.push(a);
                    }
                }, this);
            } else {
                order = null;
            }
            return this.mergeOptions({order:order});
        },

        /**
         * Alias of {@liink patio.Dataset#orderMore};
         */
        orderAppend:function(){
            return this.orderMore.apply(this, arguments);
        },

        /**
         * @see patio.Dataset#order
         */
        orderBy:function(){
            return this.order.apply(this, arguments);
        },

        /**
         * Returns a copy of the dataset with the order columns added
         * to the end of the existing order. For more detail
         * @see patio.Dataset#order
         *
         * @example
         *
         * DB.from("items").order("a").order("b");
         *      //=> SELECT * FROM items ORDER BY b
         *
         * DB.from("items").order("a").orderMore("b");
         *      //=>SELECT * FROM items ORDER BY a, b
         */
        orderMore:function(){
            var args = comb.argsToArray(arguments);
            if (this.__opts.order) {
                args = this.__opts.order.concat(args);
            }
            return this.order.apply(this, args);
        },

        /**
         * Returns a copy of the dataset with the order columns added
         * to the beginning of the existing order. For more detail
         * @see patio.Dataset#order
         *
         * @example
         * DB.from("items").order("a").order("b");
         *      //=> SELECT * FROM items ORDER BY b
         *
         * DB.from("items").order("a").orderPrepend("b");
         *      //=>SELECT * FROM items ORDER BY b, a
         *
         *
         **/
        orderPrepend:function(){
            var ds = this.order.apply(this, arguments);
            return this.__opts.order ? ds.orderMore.apply(ds, this.__opts.order) : ds;
        },

        /**
         * Qualify to the given table, or {@link patio.Dataset#firstSourceAlias} if not table is given.
         *
         * @example
         * DB.from("items").filter({id : 1}).qualify();
         *    //=> SELECT items.* FROM items WHERE (items.id = 1)
         *
         * DB.from("items").filter({id : 1}).qualify("i");
         *   //=> SELECT i.* FROM items WHERE (i.id = 1)
         *
         * @param {String|patio.sql.Identifier} [table={@link patio.Dataset#firstSourceAlias}] the table name to qualify to.
         *
         * @return {patio.Dataset} a cloned dataset qualified to the table or @link patio.Dataset#firstSourceAlias}
         **/
        qualify:function(table){
            table = table || this.firstSourceAlias;
            return this.qualifyTo(table);
        },

        /**
         * Qualify the dataset to its current first source(first from clause).  This is useful
         * if you have unqualified identifiers in the query that all refer to
         * the first source, and you want to join to another table which
         * has columns with the same name as columns in the current dataset.
         * See {@link patio.Dataset#qualifyTo}
         *
         * @example
         *
         * DB.from("items").filter({id : 1}).qualifyToFirstSource();
         *      //=> SELECT items.* FROM items WHERE (items.id = 1)
         *
         * @return {patio.Dataset} a cloned dataset that is qualified with the first source.
         * */
        qualifyToFirstSource:function(){
            return this.qualifyTo(this.firstSourceAlias);
        },

        /**
         * Return a copy of the dataset with unqualified identifiers in the
         * SELECT, WHERE, GROUP, HAVING, and ORDER clauses qualified by the
         * given table. If no columns are currently selected, select all
         * columns of the given table.
         *
         * @example
         *   DB.from("items").filter({id : 1}).qualifyTo("i");
         *      //=> SELECT i.* FROM items WHERE (i.id = 1)
         *
         * @param {String} table the name to qualify identifier to.
         *
         * @return {patio.Dataset} a cloned dataset with unqualified identifiers qualified.
         */
        qualifyTo:function(table){
            var o = this.__opts;
            if (o.sql) {
                return this.mergeOptions();
            }
            var h = {};
            array.intersect(Object.keys(o), this._static.QUALIFY_KEYS).forEach(function(k){
                h[k] = this._qualifiedExpression(o[k], table);
            }, this);
            if (!o.select || comb.isEmpty(o.select)) {
                h.select = [new ColumnAll(table)];
            }
            return this.mergeOptions(h);
        },


        /**
         * Returns a copy of the dataset with the order reversed. If no order is
         * given, the existing order is inverted.
         *
         * @example
         * DB.from("items").reverse("id");
         *      //=> SELECT * FROM items ORDER BY id DESC
         *
         * DB.from("items").order("id").reverse();
         *      //=> SELECT * FROM items ORDER BY id DESC
         *
         * DB.from("items").order("id").reverse(sql.identifier("name").asc);
         *      //=> SELECT * FROM items ORDER BY name ASC
         *
         * @param {String|patio.sql.Identifier|Function} args variable number of columns add to order before reversing.
         *
         * @return {patio.Dataset} a cloned dataset with the order reversed.
         *
         **/
        reverse:function(args){
            args = comb.argsToArray(arguments);
            return this.order.apply(this, this._invertOrder(args.length ? args : this.__opts.order));
        },

        /**
         * @see patio.Dataset#reverse
         */
        reverseOrder:function(){
            return this.reverse.apply(this, arguments);
        },

        /**
         * Returns a copy of the dataset with the columns selected changed
         * to the given columns. This also takes a function similar to {@link patio.Dataset#filter}
         *
         * @example
         *   DB.from("items").select("a");
         *      //=> SELECT a FROM items
         *
         *   DB.from("items").select("a", "b");
         *      //=> SELECT a, b FROM items
         *
         *   DB.from("items").select("a", function(){
         *          return this.sum("b")
         *   }).sql;  //=> SELECT a, sum(b) FROM items
         *
         *  @param {String|patio.sql.Identifier|Function} args variable number of colums to select
         *  @return {patio.Dataset} a cloned dataset with the columns selected changed.
         */
        select:function(args){
            args = comb.argsToArray(arguments);
            var columns = [];
            args.forEach(function(c){
                if (comb.isFunction(c)) {
                    var res = c.apply(sql, [sql]);
                    columns = columns.concat(comb.isArray(res) ? res : [res]);
                } else {
                    columns.push(c);
                }
            });
            var select = [];
            columns.forEach(function(c){
                if (comb.isHash(c)) {
                    for (var i in c) {
                        select.push(new AliasedExpression(new Identifier(i), c[i]));
                    }
                } else if (comb.isString(c)) {
                    select.push(this.stringToIdentifier(c));
                } else {
                    select.push(c);
                }
            }, this);
            return this.mergeOptions({select:select});

        },

        /**
         * Returns a cloned dataset that selects *.
         *
         * @return {patio.Dataset}  a cloned dataset that selects *.
         */
        selectAll:function(){
            return this.mergeOptions({select:null});
        },

        /**
         * Returns a copy of the dataset with the given columns added
         * to the existing selected columns. If no columns are currently selected,
         * it will select the columns given in addition to *.
         *
         * @example
         *   DB.from("items").select("a").selectAppend("b").sql;
         *      //=> SELECT b FROM items
         *
         *   DB.from("items").select("a").selectAppend("b", "c", "d").sql
         *      //=> SELECT a, b, c, d FROM items
         *
         *   DB.from("items").selectAppend("b").sql
         *      //=> SELECT *, b FROM items
         *
         * @param [...] cols variable number of columns to add to the select statement
         *
         * @return {patio.Dataset} returns a cloned dataset with the new select columns appended.
         */
        selectAppend:function(cols){
            cols = comb.argsToArray(arguments);
            var currentSelect = this.__opts.select;
            if (!currentSelect || !currentSelect.length) {
                currentSelect = [this._static.WILDCARD];
            }
            return this.select.apply(this, currentSelect.concat(cols));
        },

        /**
         * Returns a copy of the dataset with the given columns added
         * to the existing selected columns. If no columns are currently selected
         * it will just select the columns given.
         *
         * @example
         *   DB.from("items").select("a").select("b").sql;
         *      //=> SELECT b FROM items
         *
         *   DB.from("items").select("a").selectMore("b", "c", "d").sql
         *      //=> SELECT a, b, c, d FROM items
         *
         *   DB.from("items").selectMore("b").sql
         *      //=> SELECT b FROM items
         *
         * @param [...] cols variable number of columns to add to the select statement
         *
         * @return {patio.Dataset} returns a cloned dataset with the new select columns appended.
         */
        selectMore:function(cols){
            cols = comb.argsToArray(arguments);
            var currentSelect = this.__opts.select;
            return this.select.apply(this, (currentSelect || []).concat(cols));
        },

        /**
         * Set the default values for insert and update statements.  The values hash passed
         * to insert or update are merged into this hash, so any values in the hash passed
         * to insert or update will override values passed to this method.
         *
         *  @example
         *   DB.from("items").setDefaults({a : 'a', c : 'c'}).insert({a : 'd', b : 'b'}).insertSql();
         *      //=> INSERT INTO items (a, c, b) VALUES ('d', 'c', 'b')
         *
         * @param {Object} hash object with key value pairs to use as override values
         *
         * @return {patio.Dataset} a cloned dataset with the defaults added to the current datasets defaults.
         */
        setDefaults:function(hash){
            return this.mergeOptions({defaults:comb.merge({}, this.__opts.defaults || {}, hash)});
        },

        /**
         * Set values that override hash arguments given to insert and update statements.
         * This hash is merged into the hash provided to insert or update, so values
         * will override any values given in the insert/update hashes.
         *
         * @example
         *   DB.from("items").setOverrides({a : 'a', c : 'c'}).insert({a : 'd', b : 'b'}).insertSql();
         *      //=> INSERT INTO items (a, c, b) VALUES ('a', 'c', 'b')
         *
         * @param {Object} hash object with key value pairs to use as override values
         *
         * @return {patio.Dataset} a cloned dataset with the overrides added to the current datasets overrides.
         */
        setOverrides:function(hash){
            return this.mergeOptions({overrides:comb.merge({}, this.__opts.overrides || {}, hash)});
        },

        /**
         * Returns a copy of the dataset with no filters (HAVING or WHERE clause) applied.
         * @example
         *  DB.from("items").group("a").having({a : 1}).where("b").unfiltered().sql;
         *      //=> SELECT * FROM items GROUP BY a
         *
         * @return {patio.Dataset} a cloned dataset with no HAVING or WHERE clause.
         */
        unfiltered:function(){
            return this.mergeOptions({where:null, having:null});
        },

        /**
         * Returns a copy of the dataset with no GROUP or HAVING clause.
         *
         * @example
         *  DB.from("t").group("a").having({a : 1}).where("b").ungrouped().sql;
         *      //=> SELECT * FROM t WHERE b
         *
         * @return {patio.Dataset} a cloned dataset with no GROUP or HAVING clause.
         */
        ungrouped:function(){
            return this.mergeOptions({group:null, having:null});
        },

        /**
         * Adds a UNION clause using a second dataset object.
         * A UNION compound dataset returns all rows in either the current dataset
         * or the given dataset.
         * Options:
         * :alias :: Use the given value as the from_self alias
         * :all :: Set to true to use UNION ALL instead of UNION, so duplicate rows can occur
         * :from_self :: Set to false to not wrap the returned dataset in a from_self, use with care.
         *
         * @example
         * DB.from("items").union(DB.from("otherItems")).sql;
         *      //=> SELECT * FROM items UNION SELECT * FROM other_items
         *
         * DB.from("items").union(DB.from("otherItems"), {all : true, fromSelf : false}).sql;
         *      //=> SELECT * FROM items UNION ALL SELECT * FROM other_items
         *
         * DB.from("items").union(DB.from("otherItems"), {alias : "i"})
         *      //=> SELECT * FROM (SELECT * FROM items UNION SELECT * FROM other_items) AS i
         *
         * @param {patio.Dataset} dataset dataset to union with
         * @param {Object} opts addional options
         * @param {String|patio.sql.Identifier} [opts.alias] Alias to use as the fromSelf alias.
         * @param {Boolean} [opt.all=false] Set to true to use UNION ALL instead of UNION so duplicate rows can occur
         * @param {Boolean} [opts.fromSelf=true] Set to false to not wrap the returned dataset in a fromSelf.
         *
         * @return {patio.Dataset} a cloned dataset with the union.
         *
         */
        union:function(dataset, opts){
            opts = comb.isUndefined(opts) ? {} : opts;
            if (!comb.isHash(opts)) {
                opts = {all:opts};
            }
            return this.compoundClone("union", dataset, opts);
        },

        /**
         * Returns a copy of the dataset with no limit or offset.
         *
         * @example
         *  DB.from("t").limit(10, 20).unlimited().sql;
         *      //=> SELECT * FROM t
         *
         * @return {patio.Dataset} a cloned dataset with no limit or offset.
         */
        unlimited:function(){
            return this.mergeOptions({limit:null, offset:null});
        },

        /**
         * Returns a copy of the dataset with no order.
         *
         * @example
         *  DB.from("t").order("a", sql.identifier("b").desc()).unordered().sql;
         *      //=> SELECT * FROM t
         *
         * @return {patio.Dataset} a cloned dataset with no order.
         */
        unordered:function(){
            return this.order(null);
        },

        /**
         * Add a condition to the WHERE clause.  See {@link patio.Dataset#filter} for argument types.
         *
         * @example
         *   DB.from("test").where('price < ? AND id in ?', 100, [1, 2, 3]).sql;
         *      //=> "SELECT * FROM test WHERE (price < 100 AND id in (1, 2, 3))"
         *   DB.from("test").where('price < {price} AND id in {ids}', {price:100, ids:[1, 2, 3]}).sql;
         *      //=> "SELECT * FROM test WHERE (price < 100 AND id in (1, 2, 3))")
         *
         */
        where:function(){
            return this._filter.apply(this, ["where"].concat(comb.argsToArray(arguments)));
        },

        /**
         * Add a common table expression (CTE) with the given name and a dataset that defines the CTE.
         * A common table expression acts as an inline view for the query.
         *
         * @name with
         * @example
         *
         * DB.from("t")["with"]("t", db.from("x"))["with"]("j", db.from("y")).sql;
         *      //=> 'WITH t AS (SELECT * FROM x), j AS (SELECT * FROM y) SELECT * FROM t'
         *
         * DB.from("t")["with"]("t", db.from("x")).withRecursive("j", db.from("y"), db.from("j")).sql;
         *      //=> 'WITH t AS (SELECT * FROM x), j AS (SELECT * FROM y UNION ALL SELECT * FROM j) SELECT * FROM t'
         *
         * DB.from("t")["with"]("t", db.from("x"), {args:["b"]}).sql;
         *      //=> 'WITH t(b) AS (SELECT * FROM x) SELECT * FROM t'
         *
         * @param {String} name the name of the to assign to the CTE.
         * @param {patio.Dataset} dataset the dataset to use for the CTE.
         * @param {Object} opts extra options.
         * @param {String[]} [opts.args] colums/args for the CTE.
         * @param {Boolean} [opts.recursive] set to true that the CTE is recursive.
         *
         * @return {patio.Dataset} a cloned dataset with the CTE.
         */
        "with":function(name, dataset, opts){
            if (!this.supportsCte) {
                throw new QueryError("this dataset does not support common table expressions");
            }
            return this.mergeOptions({
                "with":(this.__opts["with"] || []).concat([comb.merge(opts || {}, {name:this.stringToIdentifier(name), dataset:dataset})])
            });
        },

        /**
         * Add a recursive common table expression (CTE) with the given name, a dataset that
         * defines the nonrecursive part of the CTE, and a dataset that defines the recursive part
         * of the CTE.
         *
         *  @example
         *
         * //Sing withRecursive call.
         * DB.from("t").withRecursive("t", db.from("x"), db.from("t")).sql;
         *          //=> 'WITH t AS (SELECT * FROM x UNION ALL SELECT * FROM t) SELECT * FROM t'
         *
         * //Multiple withRecursive calls.
         * DB.from("t").withRecursive("t", db.from("x"), db.from("t"))
         *    .withRecursive("j", db.from("y"), db.from("j")).sql;
         *          //=> 'WITH t AS (SELECT * FROM x UNION ALL SELECT * FROM t),
         *                     j AS (SELECT * FROM y UNION ALL SELECT * FROM j) SELECT * FROM t';
         *
         * //Adding args
         * DB.from("t").withRecursive("t", db.from("x"), db.from("t"), {args:["b", "c"]}).sql;
         *          //=> 'WITH t(b, c) AS (SELECT * FROM x UNION ALL SELECT * FROM t) SELECT * FROM t'
         *
         * //Setting union all to false
         * DB.from("t").withRecursive("t", db.from("x"), db.from("t"), {unionAll:false}).sql;
         *          //=> 'WITH t AS (SELECT * FROM x UNION SELECT * FROM t) SELECT * FROM t');
         *
         * @param {String} name the name to assign to the CTE
         * @param {patio.Dataset} nonRecursive the non-recursive part of the CTE
         * @param {patio.Dataset} recursive the recursive part of the CTE
         * @param {Object} [opts={}] extra options
         * @param {String[]} [opts.args] columns to include with the CTE
         * @param {Boolena} [opts.unionAll] set to false to use UNION instead of UNION ALL when combining non recursive
         *                                with recursive.
         *
         * @return {patio.Dataset} a cloned dataset with the CTE.
         */
        withRecursive:function(name, nonRecursive, recursive, opts){
            if (!this.supportsCte) {
                throw new QueryError("This dataset does not support common table expressions");
            }
            opts = opts || {};
            var wit = (this.__opts["with"] || []).concat([comb.merge(opts, {recursive:true, name:this.stringToIdentifier(name), dataset:nonRecursive.union(recursive, {all:opts.unionAll != false, fromSelf:false})})]);
            return this.mergeOptions({"with":wit});
        },

        /**
         * Returns a copy of the dataset with the static SQL used.  This is useful if you want
         * to keep the same {@link patio.Dataset#rowCb}/{@link patio.Dataset#graph},
         *  but change the SQL used to custom SQL.
         *
         * @example
         *  DB.from("items").withSql('SELECT * FROM foo')
         *          //=> SELECT * FROM foo
         *
         *  @param {String} sql sql for the dataset to use.
         *
         *  @return {patio.Dataset} a cloned dataset with the static sql set.
         */
        withSql:function(sql){
            var args = comb.argsToArray(arguments).slice(1);
            if (args.length) {
                sql = new PlaceHolderLiteralString(sql, args)
            }
            return this.mergeOptions({sql:sql});
        },


        /**
         * Add the dataset to the list of compounds
         *
         * @param {String} type the type of compound (i.e. "union", "intersect")
         * @param {patio.Dataset} dataset the dataset to add to
         * @param [Object] [options={}] compound option to use (i.e {all : true})
         *
         * @return {patio.Dataset} ds with the dataset added to the compounds.
         */
        compoundClone:function(type, dataset, options){
            var ds = this._compoundFromSelf().mergeOptions({compounds:(comb.array.toArray(this.__opts.compounds || [])).concat([
                [type, dataset._compoundFromSelf(), options.all]
            ])});
            return options.fromSelf === false ? ds : ds.fromSelf(options);
        },

        /**
         * Returns the a cloned dataset with out the {@link patio.Dataset#rowCb}
         *
         * @example
         * var ds = DB.from("test");
         * ds.rowCb = function(r){
         *     r.a = r.a * 2;
         * }
         *
         * ds.all().then(function(ret){
         *      //ret === [{a : 4}, {a : 6}]
         * });
         * ds.naked().all().then(function(ret){
         *      //ret ===  [{a : 2}, {a : 3}];
         * });
         *
         * @return {patio.Dataset} a cloned dataset with out the {@link patio.Dataset#rowCb}
         */
        naked:function(){
            var ds = this.mergeOptions({});
            ds.rowCb = null;
            return ds;
        },

        /**
         * @private
         * Protected
         *
         * Internal filter method so it works on either the having or where clauses.
         */
        _filter:function(clause){
            var cond = comb.argsToArray(arguments).slice(1), cb;
            if (cond.length && comb.isFunction(cond[cond.length - 1])) {
                cb = cond.pop();
            }
            cond = cond.length == 1 ? cond[0] : cond
            if ((cond == null || cond == undefined || cond === "") || (comb.isArray(cond) && cond.length == 0 && !cb) || (comb.isObject(cond) && comb.isEmpty(cond) && !cb)) {
                return this.mergeOptions();
            } else {
                cond = this._filterExpr(cond, cb);
                var cl = this.__opts[clause];
                cl && (cond = new BooleanExpression("AND", cl, cond));
                var opts = {};
                opts[clause] = cond;
                return this.mergeOptions(opts);
            }
        },

        /**
         * Splits a possible implicit alias, handling both {@link patio.sql.AliasedExpression}s
         * and strings.  Returns an array of two elements, with the first being the
         * main expression, and the second being the alias. Alias may be null if it is a
         * string that does not contain an alias {table}___{alias}.
         */
        _splitAlias:function(c){
            var ret;
            if (comb.isInstanceOf(c, AliasedExpression)) {
                ret = [c.expression, c.alias];
            } else if (comb.isString(c)) {
                var parts = this._splitString(c), cTable = parts[0], column = parts[1], alias = parts[2];
                if (alias) {
                    ret = [cTable ? new QualifiedIdentifier(cTable, column) : column, alias];
                } else {
                    ret = [c, null];
                }
            } else {
                ret = [c, null];
            }
            return ret;
        },


        /**
         * @private
         * Inverts the given order by breaking it into a list of column references
         * and inverting them.
         *
         *   ds.invertOrder([sql.identifier("id").desc()]]) //=> [id]
         *   ds.invertOrder("category", sql.identifier("price").desc()]) #=> [category.desc(), price]
         */

        _invertOrder:function(order){
            var ret = order;
            if (order) {
                ret = order.map(function(o){
                    if (comb.isInstanceOf(o, OrderedExpression)) {
                        return o.invert();
                    } else {
                        return new OrderedExpression(comb.isString(o) ? new Identifier(o) : o);
                    }
                }, this);
            }
            return ret;
        },

        /**
         * Creates a boolean expression that each key is compared to its value using the provided operator.
         *
         * @example
         *
         * ds.__createBoolExpression("gt", {x : 1, y:2, z : 5}) //=> WHERE ((x > 1) AND (y > 2) AND (z > 5))
         * ds.__createBoolExpression("gt", [[x, 1], [y,2], [z, 5]) //=> WHERE ((x > 1) AND (y > 2) AND (z > 5))
         * ds.__createBoolExpression("lt", {x : 1, y:2, z : 5}) //=> WHERE ((x < 1) AND (y < 2) AND (z < 5))
         * ds.__createBoolExpression("lt", [[x, 1], [y,2], [z, 5]) //=> WHERE ((x < 1) AND (y < 2) AND (z < 5))
         *
         * @param {String} op valid boolean expression operator to capare each K,V pair with
         * @param {Object| Array } obj object or two dimensional array containing key value pairs
         *
         * @return {patio.sql.BooleanExpression} boolean expression joined by a AND of each key value pair compared by the op
         */
        __createBoolExpression:function(op, obj){
            var pairs = [];
            if (Expression.isConditionSpecifier(obj)) {
                if (comb.isHash(obj)) {
                    obj = comb.array.toArray(obj);
                }
                obj.forEach(function(pair){
                    pairs.push(new BooleanExpression(op, new Identifier(pair[0]), pair[1]));
                });
            }
            return pairs.length == 1 ? pairs[0] : BooleanExpression.fromArgs(["AND"].concat(pairs));
        },

        /**
         * @private
         *
         * Creates a boolean expression where the key is '>=' value 1 and '<=' value two.
         *
         * @example
         *
         * ds.__createBetweenExpression({x : [1,2]}) => //=> WHERE ((x >= 1) AND (x <= 10))
         * ds.__createBetweenExpression({x : [1,2]}, true) => //=> WHERE ((x < 1) OR (x > 10))
         *
         * @param {Object} obj object where the keys are columns and the values are two element arrays.
         * @param {Boolean} [invert] if set to true it inverts the between to make it not between the two values
         *
         * @return {patio.sql.BooleanExpression} a boolean expression containing the between expression.
         */
        __createBetweenExpression:function(obj, invert){
            var pairs = [];
            for (var i in obj) {
                var v = obj[i];
                if (comb.isArray(v) && v.length) {
                    var ident = this.stringToIdentifier(i);
                    pairs.push(new BooleanExpression("AND", new BooleanExpression("gte", ident, v[0]), new BooleanExpression("lte", ident, v[1])));
                } else {
                    throw new QueryError("Between requires an array for the value");
                }
            }
            var ret = pairs.length == 1 ? pairs[0] : BooleanExpression.fromArgs(["AND"].concat(pairs))
            return invert ? BooleanExpression.invert(ret) : ret;
        },


        /**
         * @private
         * Converts an array to a two dimensional array where the first element
         * is the identifier and the second argument is the value that the value should equal
         * used by is{Null|NotNull|True|NotTrue|False|notFalse} functions to join all the values passed in.
         * @param {String[]|patio.sql.Identifier} arr array of elements to make a condition specifier out of
         * @param defaultOp the value to assign a value if one is not provided.
         *
         * @return { [[]] } an array of two element arrays.
         */
        __arrayToConditionSpecifier:function(arr, defaultOp){
            var ret = [];
            arr.forEach(function(a){
                if (comb.isString(a)) {
                    a = this.stringToIdentifier(a);
                }
                if (comb.isInstanceOf(a, Identifier)) {
                    ret.push([a, defaultOp]);
                } else if (comb.isHash(a)) {
                    ret = ret.concat(array.toArray(a));
                } else {
                    throw new QueryError("Invalid condition specifier " + a);
                }
            }, this);
            return ret;
        },

        /**
         * @private
         *
         * SQL expression object based on the expr type.  See {@link patio.Dataset#filter}
         */
        _filterExpr:function(expr, cb){
            expr = (comb.isUndefined(expr) || comb.isNull(expr) || (comb.isArray(expr) && !expr.length)) ? null : expr;
            if (expr && cb) {
                return new BooleanExpression("AND", this._filterExpr(expr), this._filterExpr(cb))
            } else if (cb) {
                expr = cb
            }
            if (comb.isInstanceOf(expr, Expression)) {
                if (comb.isInstanceOf(expr, NumericExpression, StringExpression)) {
                    throw new QueryError("Invalid SQL Expression type : " + expr);
                }
                return expr;
            } else if (comb.isArray(expr)) {
                if (expr.length) {
                    var first = expr[0];
                    if (comb.isString(first)) {
                        return new PlaceHolderLiteralString(first, expr.slice(1), true);
                    } else if (Expression.isConditionSpecifier(expr)) {
                        return BooleanExpression.fromValuePairs(expr)
                    } else {
                        return BooleanExpression.fromArgs(["AND"].concat(expr.map(function(e){
                            return this._filterExpr(e);
                        }, this)));
                    }
                }
            } else if (comb.isFunction(expr)) {
                return this._filterExpr(expr.call(sql, sql));
            } else if (comb.isBoolean(expr)) {
                return new BooleanExpression("NOOP", expr);
            }else if(comb.isString(expr)){
                return this.stringToIdentifier(expr);
            } else if (comb.isInstanceOf(expr, LiteralString)) {
                return new LiteralString("(" + expr + ")");
            } else if (comb.isHash(expr)) {
                return BooleanExpression.fromValuePairs(expr);
            } else {
                throw new QueryError("Invalid filter argument");
            }
        },



        /**@ignore*/
        getters:{

            /**
             * @ignore
             * Returns true if this dataset is a simple SELECT * FROM {table}, otherwise false.
             */
            isSimpleSelectAll:function(){
                var o = {}, opts = this.__opts, count = 0;
                for (var i in opts) {
                    if (opts[i] != null && this._static.NON_SQL_OPTIONS.indexOf(i) == -1) {
                        o[i] = opts[i];
                        count++;
                    }
                }
                var f = o.from
                return count == 1 && f.length == 1 && (comb.isString(f[0]) || comb.isInstanceOf(f[0], AliasedExpression, Identifier));
            }
        }
    },

    static:{
        /**@lends patio.Dataset*/

        /**
         * These strings have {name}Join methods created (e.g. {@link patio.Dataset#innerJoin}) that
         * call {@link patio.Dataset#joinTable} with the string, passing along the arguments and
         * block from the method call.
         **/
        CONDITIONED_JOIN_TYPES:["inner", "fullOuter", "rightOuter", "leftOuter", "full", "right", "left"],

        /**
         *
         * These strings have {name}Join methods created (e.g. naturalJoin) that
         * call {@link patio.Dataset#joinTable}.  They only accept a single table
         * argument which is passed to {@link patio.Dataset#joinTable}, and they throw an error
         * if called with a block.
         **/
        UNCONDITIONED_JOIN_TYPES:["natural", "naturalLeft", "naturalRight", "naturalFull", "cross"],

        /**
         *  The dataset options that require the removal of cached columns
         *  if changed.
         */
        COLUMN_CHANGE_OPTS:["select", "sql", "from", "join"],

        /**
         * Which options don't affect the SQL generation.  Used by {@link patio.Dataset#simpleSelectAll}
         * to determine if this is a simple SELECT * FROM table.
         */
        NON_SQL_OPTIONS:["server", "defaults", "overrides", "graph", "eagerGraph", "graphAliases"],


        /**
         *  All methods that return modified datasets with a joined table added.
         */
        JOIN_METHODS:["join", "joinTable"],

        /**
         * Methods that return modified datasets
         */
        QUERY_METHODS:['addGraphAliases', "and", "distinct", "except", "exclude", "filter", "find", "is", "isNot",
            "eq", "neq", "lt", "lte", "gt", "gte", "forUpdate", "from", "fromSelf", "graph", "grep", "group",
            "groupAndCount", "groupBy", "having", "intersect", "invert", "limit", "lockStyle", "naked", "or", "order",
            "orderAppend", "orderBy", "orderMore", "orderPrepend", "qualify", "reverse",
            "reverseOrder", "select", "selectAll", "selectAppend", "selectMore", "setDefaults",
            "setGraphAliases", "setOverrides", "unfiltered", "ungraphed", "ungrouped", "union", "unlimited",
            "unordered", "where", "with", "withRecursive", "withSql"],

        init:function(){
            this._super(arguments);
            //initialize our join methods array
            var joinMethods = this.JOIN_METHODS;
            var queryMethods = this.QUERY_METHODS;
            this.UNCONDITIONED_JOIN_TYPES.forEach(function(joinType){
                var m = joinType + "Join";
                joinMethods.push(m);
                queryMethods.push(m);
            });
            this.CONDITIONED_JOIN_TYPES.forEach(function(joinType){
                var m = joinType + "Join";
                joinMethods.push(m);
                queryMethods.push(m);
            });
            this.QUERY_METHODS = queryMethods.concat(joinMethods);
        }
    }
}).as(module);
