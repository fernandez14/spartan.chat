var exports = module.exports = {};
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

const userSchema = new Schema({
    username: String,
    image: String,
    roles: [{name: String}],
});

exports.User = mongoose.model('User', userSchema);