var exports = module.exports = {};
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

const userSchema = new Schema({
    username: String,
    image: String,
    roles: [{name: String}],
});

userSchema.virtual('role').get(function () {
    for (var i in this.roles) {
        if (this.roles[i].name !== 'user') {
            return this.roles[i].name;
        }
    }

    return 'user';
});

exports.User = mongoose.model('User', userSchema);