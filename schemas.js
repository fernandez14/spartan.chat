var exports = module.exports = {};
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

const userSchema = new Schema({
    username: String,
    image: String,
    roles: [{name: String}],
});

userSchema.virtual('role').get(function () {
    const roles = this.roles;
    for (let i = 0; i < roles.length; i++) {
        if ('name' in roles[i] && roles[i].name !== 'user') {
            return String(roles[i].name);
        }
    }

    return 'user';
});

exports.User = mongoose.model('User', userSchema);