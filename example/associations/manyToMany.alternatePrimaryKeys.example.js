"use strict";
var patio = require("../../index"), sql = patio.sql, comb = require("comb"), format = comb.string.format;

patio.camelize = true;

var disconnect = comb.hitch(patio, "disconnect");
var disconnectError = function(err){
    patio.logError(err);
    patio.disconnect();
}
comb.logging.Logger.getRootLogger().level = comb.logging.Level.ERROR;
var createTables = function(){
    return patio.connectAndExecute("mysql://test:testpass@localhost:3306/sandbox", function(db, patio){
        db.forceDropTable("classesStudents", "studentsClasses", "class", "student");
        db.createTable("class", function(){
            this.primaryKey("id");
            this.semester("char", {size:10});
            this.unique(["name", "subject"]);
            this.name(String);
            this.subject(String);
            this.description("text");
            this.graded(Boolean, {"default":true});
        });
        db.createTable("student", function(){
            this.primaryKey("id");
            this.firstName(String);
            this.lastName(String);
            this.unique(["firstName", "lastName"]);
            //GPA
            this.gpa(sql.Decimal, {size:[1, 3], "default":0.0});
            //Honors Program?
            this.isHonors(Boolean, {"default":false});
            //freshman, sophmore, junior, or senior
            this.classYear("char");
        });
        //this isnt very practical but it gets the point across
        db.createTable("classes_students", function(){
            this.firstNameKey(String);
            this.lastNameKey(String);
            this.nameKey(String);
            this.subjectKey(String);
            this.foreignKey(["firstNameKey", "lastNameKey"], "student", {key:["firstName", "lastName"]});
            this.foreignKey(["nameKey", "subjectKey"], "class", {key:["name", "subject"]});
        });

    });
};

var createModels = function(){
    var classModelPromise = patio.addModel("class", {
        static:{
            init:function(){
                this.manyToMany("students",
                    {fetchType:this.fetchType.EAGER,
                        leftPrimaryKey:["name", "subject"],
                        leftKey:["nameKey", "subjectKey"],
                        rightPrimaryKey:["firstName", "lastName"],
                        rightKey:["firstNameKey", "lastNameKey"], order:[sql.firstName.desc(), sql.lastName.desc()]});
                this.manyToMany("aboveAverageStudents", {model:"student", leftPrimaryKey:["name", "subject"],
                    leftKey:["nameKey", "subjectKey"],
                    rightPrimaryKey:["firstName", "lastName"],
                    rightKey:["firstNameKey", "lastNameKey"]}, function(ds){
                    return ds.filter({gpa:{gte:3.5}});
                });
                this.manyToMany("averageStudents", {model:"student", leftPrimaryKey:["name", "subject"],
                    leftKey:["nameKey", "subjectKey"],
                    rightPrimaryKey:["firstName", "lastName"],
                    rightKey:["firstNameKey", "lastNameKey"]}, function(ds){
                    return ds.filter({gpa:{between:[2.5, 3.5]}});
                });
                this.manyToMany("belowAverageStudents", {model:"student",
                    leftPrimaryKey:["name", "subject"],
                    leftKey:["nameKey", "subjectKey"],
                    rightPrimaryKey:["firstName", "lastName"],
                    rightKey:["firstNameKey", "lastNameKey"]}, function(ds){
                    return ds.filter({gpa:{lt:2.5}});
                });
            }
        }
    });
    var studentModelPromise = patio.addModel("student", {

        instance:{
            enroll:function(clas){
                if (comb.isArray(clas)) {
                    return this.addClasses(clas);
                } else {
                    return this.addClass(clas);
                }
            }
        },

        static:{
            init:function(){
                this.manyToMany("classes", {
                    fetchType:this.fetchType.EAGER,
                    leftPrimaryKey:["firstName", "lastName"],
                    leftKey:["firstNameKey", "lastNameKey"],
                    rightPrimaryKey:["name", "subject"],
                    rightKey:["nameKey", "subjectKey"],
                    order:sql.name.desc()});
            }
        }
    });
    return comb.when(classModelPromise, studentModelPromise);
};

var createData = function(){
    var DB = patio.defaultDatabase;
    var Class = patio.getModel("class");
    var Student = patio.getModel("student");
    var classInsertPromise = Class.save([
        {
            semester:"FALL",
            name:"Intro To JavaScript",
            subject:"Javascript!!!!",
            description:"This class will teach you about javascript's many uses!!!"
        },
        {
            semester:"FALL",
            name:"Pricipals Of Programming Languages",
            subject:"Computer Science",
            description:"Definition of programming languages. Global properties of algorithmic languages including "
                + "scope of declaration, storage allocation, grouping of statements, binding time. Subroutines, "
                + "coroutines and tasks. Comparison of several languages."
        },
        {
            semester:"FALL",
            name:"Theory Of Computation",
            subject:"Computer Science",
            description:"The course is intended to introduce the students to the theory of computation in a fashion "
                + "that emphasizes breadth and away from detailed analysis found in a normal undergraduate automata "
                + "course. The topics covered in the course include methods of proofs, finite automata, non-determinism,"
                + " regular expressions, context-free grammars, pushdown automata, no-context free languages, "
                + "Church-Turing Thesis, decidability, reducibility, and space and time complexity.."
        },
        {
            semester:"SPRING",
            name:"Compiler Construction",
            subject:"Computer Science",
            description:"Assemblers, interpreters and compilers. Compilation of simple expressions and statements. "
                + "Analysis of regular expressions. Organization of a compiler, including compile-time and run-time "
                + "symbol tables, lexical scan, syntax scan, object code generation and error diagnostics."
        }
    ]);
    var studentInsertPromise = Student.save([
        {
            firstName:"Bob",
            lastName:"Yukon",
            gpa:3.689,
            classYear:"Senior"
        },
        {
            firstName:"Greg",
            lastName:"Horn",
            gpa:3.689,
            classYear:"Sohpmore"
        },

        {
            firstName:"Sara",
            lastName:"Malloc",
            gpa:4.0,
            classYear:"Junior"
        },
        {
            firstName:"John",
            lastName:"Favre",
            gpa:2.867,
            classYear:"Junior"
        },
        {
            firstName:"Kim",
            lastName:"Bim",
            gpa:2.24,
            classYear:"Senior"
        },
        {
            firstName:"Alex",
            lastName:"Young",
            gpa:1.9,
            classYear:"Freshman"
        }
    ]);
    return comb.when(classInsertPromise, studentInsertPromise);
};

var printResults = function(studentDs, classDs){
    //print the results
    studentDs.forEach(
        function(student){
            var classes = student.classes;
            console.log(format("%s %s is enrolled in %s", student.firstName, student.lastName,
                !classes.length ? " no classes!" : "\n\t-" + classes.map(
                    function(clas){
                        return clas.name;
                    }).join("\n\t-")));
        }).chain(comb.hitch(classDs, "forEach", function(cls){
        console.log(format('"%s" has the following students enrolled: \n\t-%s', cls.name, cls.students.map(
            function(student){
                return format("%s %s", student.firstName, student.lastName);
            }).join("\n\t-")));
        return comb.when(cls.aboveAverageStudents, cls.averageStudents, cls.belowAverageStudents, function(res){
            var aboveAverage = res[0].map(
                function(student){
                    return format("%s %s", student.firstName, student.lastName);
                }).join("\n\t-"),
                average = res[1].map(
                    function(student){
                        return format("%s %s", student.firstName, student.lastName);
                    }).join("\n\t-"),
                belowAverage = res[2].map(
                    function(student){
                        return format("%s %s", student.firstName, student.lastName);
                    }).join("\n\t-");

            console.log(format('"%s" has the following above average students enrolled: \n\t-%s', cls.name, aboveAverage));
            console.log(format('"%s" has the following average students enrolled: \n\t-%s', cls.name, average));
            console.log(format('"%s" has the following below average students enrolled: \n\t-%s', cls.name, belowAverage));
        });
    }), disconnectError).then(disconnect, disconnectError);
};


createTables().chain(createModels, disconnectError).chain(createData, disconnectError).then(function(){
    //Get our models
    var Class = patio.getModel("class"), Student = patio.getModel("student");

    var classDs = Class.order("name"), studentDs = Student.order("firstName", "lastName");

    //Retrieve All classes and students
    comb.when(classDs.all(), studentDs.all()).then(function(results){
        //enroll the students
        var classes = results[0], students = results[1];
        comb.when.apply(comb, students.map(function(student, i){
            var ret = new comb.Promise().callback();
            if (i === 0) {
                ret = student.enroll(classes);
            } else if (i < classes.length) {
                ret = student.enroll(classes.slice(i));
            }
            return ret;
        }))
            .chain(
            function(){
                return Student.save({
                    firstName:"Zach",
                    lastName:"Igor",
                    gpa:2.754,
                    classYear:"Sophmore",
                    classes:[
                        {
                            semester:"FALL",
                            name:"Compiler Construction 2",
                            subject:"Computer Science",
                            description:"More Assemblers, interpreters and compilers. Compilation of simple expressions and statements. "
                                + "Analysis of regular expressions. Organization of a compiler, including compile-time and run-time "
                                + "symbol tables, lexical scan, syntax scan, object code generation and error diagnostics."
                        },

                        {
                            semester:"FALL",
                            name:"Operating Systems",
                            subject:"Computer Science"
                        }
                    ]
                });
            }).then(comb.partial(printResults, studentDs, classDs));
    }, disconnectError);
}, disconnectError);