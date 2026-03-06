const mysql= require("mysql2");

const pool = mysql.createPool({
    host: "localhost",
    user: "root",
    password:"313224",
    database: "test"
})
module.exports=pool.promise()