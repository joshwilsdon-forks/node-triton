/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * Test create/start/stop/delete/etc. work flows
 */

var f = require('util').format;

var vasync = require('vasync');

var h = require('./helpers');
var test = require('tape');

var common = require('../../lib/common');

var VM_ALIAS = 'node-triton-test-vm-1';
var VM_IMAGE = 'base-64@15.2.0';
var VM_PACKAGE = 't4-standard-128M';

var opts = {
    skip: !h.CONFIG.destructiveAllowed
};

/*
 * h.triton wrapper that:
 * - tests no error is present
 * - tests stdout is not empty
 * - tests stderr is empty
 *
 * In the event that any of the above is false, this function will NOT
 * fire the callback, which will result in the early terminate of these
 * tests as `t.end()` will never be called.
 */
function triton(t, args, cb) {
    t.comment(f('running: triton %s', args.join(' ')));
    h.triton(args, function (err, stdout, stderr) {
        t.error(err, 'no error running child process');
        t.equal(stderr, '', 'no stderr produced');
        t.notEqual(stdout, '', 'stdout produced');

        if (!err && stdout && !stderr)
            cb(stdout);
    });
}

// global variable to hold vm instance JSON
var instance;


// --- Tests

if (opts.skip) {
    console.error('** skipping manage workflow tests');
    console.error('** set "destructiveAllowed" to enable');
}
test('triton manage workflow', opts, function (tt) {

    // create a test machine (blocking) and output JSON
    tt.test('triton create', function (t) {
        triton(t, ['create', '-wjn', VM_ALIAS, VM_IMAGE, VM_PACKAGE],
            function (stdout) {

            // parse JSON response
            var lines = stdout.trim().split('\n');
            t.equal(lines.length, 2, 'correct number of JSON lines');
            try {
                lines = lines.map(function (line) {
                    return JSON.parse(line);
                });
            } catch (e) {
                t.fail('failed to parse JSON');
                t.end();
            }

            instance = lines[1];
            t.equal(lines[0].id, lines[1].id, 'correct UUID given');
            t.equal(lines[1].state, 'running', 'correct machine state');

            t.end();
        });
    });

    // test `triton instance -j` with the UUID, the alias, and the short ID
    tt.test('triton instance', function (t) {
        var uuid = instance.id;
        var shortId = common.uuidToShortId(uuid);
        vasync.parallel({
            funcs: [
                function (cb) {
                    triton(t, ['instance', '-j', VM_ALIAS], function (stdout) {
                        cb(null, stdout);
                    });
                },
                function (cb) {
                    triton(t, ['instance', '-j', uuid], function (stdout) {
                        cb(null, stdout);
                    });
                },
                function (cb) {
                    triton(t, ['instance', '-j', shortId], function (stdout) {
                        cb(null, stdout);
                    });
                }
            ]
        }, function (err, results) {
            if (h.ifErr(t, err, 'no error'))
                return t.end();

            var output;
            try {
                output = results.operations.map(function (op) {
                    return JSON.parse(op.result);
                });
            } catch (e) {
                t.fail('failed to parse JSON');
                t.end();
            }

            output.forEach(function (res) {
                t.deepEqual(output[0], res, 'same data');
            });

            t.end();
        });
    });

    // remove instance
    tt.test('triton delete', function (t) {
        triton(t, ['delete', '-w', instance.id], function (stdout) {
            t.end();
        });
    });

    // create a test machine (non-blocking)
    tt.test('triton create', function (t) {
        triton(t, ['create', '-jn', VM_ALIAS, VM_IMAGE, VM_PACKAGE],
            function (stdout) {

            // parse JSON response
            var lines = stdout.trim().split('\n');
            t.equal(lines.length, 1, 'correct number of JSON lines');
            var d;
            try {
                d = JSON.parse(lines[0]);
            } catch (e) {
                t.fail('failed to parse JSON');
                t.end();
            }
            instance = d;

            t.equal(d.state, 'provisioning', 'correct machine state');

            t.end();
        });
    });

    // wait for the machine to start
    tt.test('triton wait', function (t) {
        triton(t, ['wait', instance.id],
            function (stdout) {

            // parse JSON response
            var lines = stdout.trim().split('\n');
            t.equal(lines.length, 2, 'correct number of stdout lines');

            t.ok(lines[0].match(/\(states: running, failed\)$/),
                'first line correct');
            t.ok(lines[1].match(/moved to state running$/),
                'second line correct');

            t.end();
        });
    });

    // stop the machine
    tt.test('triton stop', function (t) {
        triton(t, ['stop', '-w', VM_ALIAS],
            function (stdout) {
            t.ok(stdout.match(/^Stop instance/, 'correct stdout'));
            t.end();
        });
    });

    // wait for the machine to stop
    tt.test('triton confirm stopped', function (t) {
        triton(t, ['instance', '-j', VM_ALIAS],
            function (stdout) {
            var d;
            try {
                d = JSON.parse(stdout);
            } catch (e) {
                t.fail('failed to parse JSON');
                t.end();
            }
            instance = d;

            t.equal(d.state, 'stopped', 'machine stopped');

            t.end();
        });
    });

    // start the machine
    tt.test('triton start', function (t) {
        triton(t, ['start', '-w', VM_ALIAS],
            function (stdout) {
            t.ok(stdout.match(/^Start instance/, 'correct stdout'));
            t.end();
        });
    });

    // wait for the machine to start
    tt.test('triton confirm running', function (t) {
        triton(t, ['instance', '-j', VM_ALIAS],
            function (stdout) {
            var d;
            try {
                d = JSON.parse(stdout);
            } catch (e) {
                t.fail('failed to parse JSON');
                t.end();
            }
            instance = d;

            t.equal(d.state, 'running', 'machine running');

            t.end();
        });
    });

    // remove test instance
    tt.test('triton cleanup (delete)', function (t) {
        triton(t, ['delete', '-w', instance.id], function (stdout) {
            t.end();
        });
    });

});
