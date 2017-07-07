// See http://brunch.io for documentation.
exports.files = {
    javascripts: {
        joinTo: {
            'vendor.js': /^(?!app)/, // Files that are not in `app` dir.
            'app.js': /^app/
        }
    },
    stylesheets: {joinTo: 'app.css'}
};

exports.npm = {
    styles: {
        tachyons: ['css/tachyons.css'],
        'tippy.js': ['dist/tippy.css']
    }
};

exports.plugins = {
    babel: {presets: ['latest', 'stage-2'], plugins: ['transform-object-rest-spread']}
};


exports.server = {
    base: '/chat',
};