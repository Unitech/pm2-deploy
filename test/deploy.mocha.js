'use strict';

/* eslint-env mocha */

var EventEmitter = require('events').EventEmitter;
var format = require('util').format;
// eslint-disable-next-line camelcase
var child_process = require('child_process');
var deploy = require('../deploy.js');
var path = require('path');

describe('deploy', function () {
  describe('deployForEnv', function () {
    var spawnCalls;
    var spawnNotifier;
    beforeEach(function () {
      spawnCalls = [];
      spawnNotifier = new EventEmitter();
    });

    child_process.spawn = function (cmd, args, options) {
      spawnCalls.push(arguments);
      var proc = new EventEmitter();

      process.nextTick(function () {
        spawnNotifier.emit('spawned', proc);
      });

      return proc;
    };

    var config;
    var options;
    beforeEach(function () {
      config = {
        staging: {
          user: 'user',
          host: 'host',
          repo: 'repo',
          path: 'path',
          ref: 'ref',
          'post-deploy': 'post-deploy',
        },
      };
      options = { logging: false };
    });

    it('is a function', function () {
      deploy.deployForEnv.should.be.a.Function();
    });

    it('returns `false`', function () {
      var ret = deploy.deployForEnv(config, 'staging', [], options, function () {});
      ret.should.be.false();
    });

    describe('deploy_conf validation', function () {
      it('validate user', function (done) {
        config.staging.user = '';
        deploy.deployForEnv(config, 'staging', [], options, function (err) {
          err.should.be.an.Error();
          err.code.should.equal(200);
          err.message.should.match('String is too short (0 chars), minimum 1');
          done();
        });
      });

      it('requires host', function (done) {
        delete config.staging.host;
        deploy.deployForEnv(config, 'staging', [], options, function (err) {
          err.should.be.an.Error();
          err.code.should.equal(302);
          err.message.should.match('Missing required property: host');
          done();
        });
      });

      it('requires repo', function (done) {
        delete config.staging.repo;
        deploy.deployForEnv(config, 'staging', [], options, function (err) {
          err.should.be.an.Error();
          err.code.should.equal(302);
          err.message.should.match('Missing required property: repo');
          done();
        });
      });

      it('requires path', function (done) {
        delete config.staging.path;
        deploy.deployForEnv(config, 'staging', [], options, function (err) {
          err.should.be.an.Error();
          err.code.should.equal(302);
          err.message.should.match('Missing required property: path');
          done();
        });
      });

      it('requires ref', function (done) {
        delete config.staging.ref;
        deploy.deployForEnv(config, 'staging', [], options, function (err) {
          err.should.be.an.Error();
          err.code.should.equal(302);
          err.message.should.match('Missing required property: ref');
          done();
        });
      });
    });

    describe('spawning child processes', function () {
      context('successfully', function () {
        it('invokes our callback with the supplied arguments', function (done) {
          var argsIn = [1, 2, 'three', 'four'];
          spawnNotifier.on('spawned', function (proc) {
            proc.emit('close', 0);
          });
          deploy.deployForEnv(config, 'staging', argsIn, options, function (err, argsOut) {
            argsOut.should.eql(argsIn);
            done(err);
          });
        });

        it('invokes `sh -c`', function (done) {
          spawnNotifier.on('spawned', function (proc) {
            proc.emit('close', 0);
          });
          deploy.deployForEnv(config, 'staging', [], options, function (err) {
            spawnCalls.length.should.equal(1);
            spawnCalls[0][0].should.equal('sh');
            spawnCalls[0][1].should.be.an.Array();
            spawnCalls[0][1][0].should.equal('-c');
            done(err);
          });
        });

        it('echoes a JSON blob', function (done) {
          spawnNotifier.on('spawned', function (proc) {
            proc.emit('close', 0);
          });
          deploy.deployForEnv(config, 'staging', [], options, function (err) {
            spawnCalls.length.should.equal(1);
            spawnCalls[0][1][1].should.be.a.String();

            var pipeFrom = spawnCalls[0][1][1].split(/\s*\|\s*/)[0];
            pipeFrom.should.be.ok();

            var echoJSON = pipeFrom.match(/^echo '(.+?)'/)[1];
            echoJSON.should.be.ok();

            var echoData = JSON.parse(echoJSON);
            echoData.should.be.an.Object();
            echoData.ref.should.eql(config.staging.ref);
            echoData.user.should.eql(config.staging.user);
            echoData.repo.should.eql(config.staging.repo);
            echoData.path.should.eql(path.resolve(config.staging.path));
            echoData.host.should.eql(config.staging.host);
            echoData['post-deploy'].should.eql(config.staging['post-deploy']);

            config.staging.env = { a: 1, b: 2 };
            deploy.deployForEnv(config, 'staging', [], options, function () {
              spawnCalls.length.should.equal(2);
              spawnCalls[1][1][1].should.be.a.String();
              echoData = JSON.parse(spawnCalls[1][1][1].match(/^echo '(.+?)'/)[1]);
              echoData['post-deploy'].should.eql(
                format('export A=1 B=2 && %s', config.staging['post-deploy'])
              );

              config.staging['post-deploy'] = '';
              deploy.deployForEnv(config, 'staging', [], options, function () {
                spawnCalls.length.should.equal(3);
                spawnCalls[2][1][1].should.be.a.String();
                echoData = JSON.parse(spawnCalls[2][1][1].match(/^echo '(.+?)'/)[1]);
                echoData['post-deploy'].should.eql('export A=1 B=2');
                done(err);
              });
            });
          });
        });

        it('pipes to deploy', function (done) {
          spawnNotifier.on('spawned', function (proc) {
            proc.emit('close', 0);
          });
          deploy.deployForEnv(config, 'staging', [], options, function (err) {
            spawnCalls.length.should.equal(1);
            spawnCalls[0][1][1].should.be.a.String();
            var pipeTo = spawnCalls[0][1][1].split(/\s*\|\s*/)[1];
            pipeTo.should.be.ok();
            pipeTo.should.match(/\/deploy"\s*$/);
            done(err);
          });
        });
      });

      context('with errors', function () {
        it('calls back with the error stack, if present', function (done) {
          var error = new Error('dummy error');
          spawnNotifier.on('spawned', function (proc) {
            proc.emit('error', error);
            proc.emit('close', 1);
          });
          deploy.deployForEnv(config, 'staging', [], options, function (err) {
            err.should.be.an.Error();
            err.stack.should.eql(error.stack);
            done();
          });
        });

        it('calls back with the error object, if no stack is present', function (done) {
          var error = new Error('dummy error');
          error.code = 123;
          spawnNotifier.on('spawned', function (proc) {
            proc.emit('error', error);
            proc.emit('close', 1);
          });
          deploy.deployForEnv(config, 'staging', [], options, function (err) {
            err.should.be.an.Error();
            err.code.should.eql(error.code);
            done();
          });
        });
      });

      context('for multiple hosts', function () {
        var hosts = ['1.1.1.1', '2.2.2.2', '3.3.3.3', '4.4.4.4'];

        beforeEach(function () {
          config.staging.host = hosts;
        });

        it('runs each host in series', function (done) {
          var spawnCount = 0;
          spawnNotifier.on('spawned', function (proc) {
            spawnCount += 1;
            spawnCount.should.equal(1);
            process.nextTick(function () {
              proc.emit('close', 0);
              spawnCount -= 1;
            });
          });
          deploy.deployForEnv(config, 'staging', [], options, function (err) {
            done(err);
          });
        });

        it('echoes JSON blobs with customized host attributes', function (done) {
          var spawnCount = 0;

          spawnNotifier.on('spawned', function (proc) {
            var pipeFrom = spawnCalls[spawnCount][1][1].split(/\s*\|\s*/)[0];
            pipeFrom.should.be.ok();

            var echoJSON = pipeFrom.match(/^echo '(.+?)'/)[1];
            echoJSON.should.be.ok();

            var echoData = JSON.parse(echoJSON);
            echoData.should.be.an.Object();

            echoData.ref.should.eql(config.staging.ref);
            echoData.repo.should.eql(config.staging.repo);
            echoData.path.should.eql(path.resolve(config.staging.path));
            echoData.host.should.eql(hosts[spawnCount]);
            echoData['post-deploy'].should.eql(config.staging['post-deploy']);

            spawnCount += 1;

            process.nextTick(function () {
              proc.emit('close', 0);
            });
          });

          deploy.deployForEnv(config, 'staging', [], options, function (err) {
            spawnCount.should.eql(4);
            done(err);
          });
        });

        it('echoes JSON blobs with customized host and env attributes', function (done) {
          var spawnCount = 0;

          spawnNotifier.on('spawned', function (proc) {
            var pipeFrom = spawnCalls[spawnCount][1][1].split(/\s*\|\s*/)[0];
            pipeFrom.should.be.ok();

            var echoJSON = pipeFrom.match(/^echo '(.+?)'/)[1];
            echoJSON.should.be.ok();

            var echoData = JSON.parse(echoJSON);
            echoData.should.be.an.Object();

            echoData.ref.should.eql(config.staging.ref);
            echoData.repo.should.eql(config.staging.repo);
            echoData.path.should.eql(path.resolve(config.staging.path));
            echoData.host.should.eql(hosts[spawnCount]);
            echoData['post-deploy'].should.eql(
              format('export A=1 B=2 && %s', config.staging['post-deploy'])
            );

            spawnCount += 1;

            process.nextTick(function () {
              proc.emit('close', 0);
            });
          });

          Object.assign(config.staging, { env: { a: 1, b: 2 } });
          deploy.deployForEnv(config, 'staging', [], options, function () {
            spawnCount.should.eql(4);
            done();
          });
        });

        it('invokes our callback with supplied argument arrays', function (done) {
          var argsIn = [1, 2, 'three', 'four'];
          spawnNotifier.on('spawned', function (proc) {
            proc.emit('close', 0);
          });

          deploy.deployForEnv(config, 'staging', argsIn, options, function (err, argsOut) {
            argsOut.should.be.an.Array();
            argsOut.length.should.eql(4);
            argsOut[0].should.eql(argsIn);
            argsOut[1].should.eql(argsIn);
            argsOut[2].should.eql(argsIn);
            argsOut[3].should.eql(argsIn);
            done(err);
          });
        });

        context('with errors', function () {
          it('stops spawning processes after the first failure', function (done) {
            var error = new Error('dummy error');
            error.code = 123;
            spawnNotifier.on('spawned', function (proc) {
              proc.emit('error', error);
              proc.emit('close', 1);
            });
            deploy.deployForEnv(config, 'staging', [], options, function (err) {
              err.should.be.an.Error();
              err.code.should.eql(error.code);
              spawnCalls.length.should.eql(1);
              done();
            });
          });
        });
      });
    });
  });
});
