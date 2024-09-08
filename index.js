const minimist = require('minimist')

let argv = minimist(process.argv.slice(2));
if(argv._.length === 0) {
    console.info('Usage: wrtcft (server|send|receive|version|install) [options]')
    process.exit()
}


let action = argv._[0]
if(action === 'server') {
    require('./server')
} else if (action === 'send') {
    require('./sender')
} else if (action === 'receive') {
    require('./receiver')
} else if (action === 'version') {
    let pjson = require('./package.json')
    console.info(pjson.version)
    process.exit()
    console.error(`Invalid action ${action}`)
    console.info('Usage: wrtcft (server|send|receive) [options]')
    process.exit()
}
