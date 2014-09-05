var EventEmitter = require('events').EventEmitter
var childProcess = require('child_process')
var deploy = require('../deploy.js')

describe('deploy', function() {
  describe('deployForEnv', function() {

    var spawnProc
    var spawnArguments
    beforeEach(function() {
      spawnArguments = []
      spawnProc = new EventEmitter()
    })

    childProcess.spawn = function(cmd, args, options) {
      spawnArguments = arguments
      return spawnProc
    }

    var conf
    beforeEach(function() {
      conf = {
        staging: {
          user: 'user',
          host: 'host',
          repo: 'repo',
          path: 'path',
          ref: 'ref'
        }
      }
    })

    it('is a function', function() {
      deploy.deployForEnv.should.be.a.Function
    })

    it('returns false', function() {
      var ret = deploy.deployForEnv(conf, 'staging', [], function() {})
      ret.should.be.false
    })

    describe('deploy_conf validation', function() {
      it('requires user', function(done) {
        delete conf.staging.user
        deploy.deployForEnv(conf, 'staging', [], function(err, args) {
          err.should.be.an.Object
          err.code.should.equal(302)
          err.message.should.match('Missing required property: user')
          done()
        })
      })

      it('requires host', function(done) {
        delete conf.staging.host
        deploy.deployForEnv(conf, 'staging', [], function(err, args) {
          err.should.be.an.Object
          err.code.should.equal(302)
          err.message.should.match('Missing required property: host')
          done()
        })
      })

      it('requires repo', function(done) {
        delete conf.staging.repo
        deploy.deployForEnv(conf, 'staging', [], function(err, args) {
          err.should.be.an.Object
          err.code.should.equal(302)
          err.message.should.match('Missing required property: repo')
          done()
        })
      })

      it('requires path', function(done) {
        delete conf.staging.path
        deploy.deployForEnv(conf, 'staging', [], function(err, args) {
          err.should.be.an.Object
          err.code.should.equal(302)
          err.message.should.match('Missing required property: path')
          done()
        })
      })

      it('requires ref', function(done) {
        delete conf.staging.ref
        deploy.deployForEnv(conf, 'staging', [], function(err, args) {
          err.should.be.an.Object
          err.code.should.equal(302)
          err.message.should.match('Missing required property: ref')
          done()
        })
      })
    })

    describe('spawning child processes', function() {
      context('successfully', function() {
        it('invokes our callback with the supplied arguments', function(done) {
          var argsIn = [1,2,'three','four']
          deploy.deployForEnv(conf, 'staging', argsIn, function(err, argsOut) {
            argsOut.should.eql(argsIn)
            done()
          })
          spawnProc.emit('close', 0)
        })

        it('invokes sh -c', function(done) {
          deploy.deployForEnv(conf, 'staging', [], function(err, args) {
            spawnArguments[0].should.equal('sh')
            spawnArguments[1].should.be.an.Array
            spawnArguments[1][0].should.equal('-c')
            done()
          })
          spawnProc.emit('close', 0)
        })

        it('echoes a json blob', function(done) {
          deploy.deployForEnv(conf, 'staging', [], function(err, args) {
            spawnArguments[1][1].should.be.a.String

            var pipeFrom = spawnArguments[1][1].split(/\s*\|\s*/)[0]
            pipeFrom.should.be.ok

            var echoJSON = pipeFrom.match(/^echo '(.+?)'/)[1]
            echoJSON.should.be.ok

            var echoData = JSON.parse(echoJSON)
            echoData.should.be.an.Object
            echoData.should.eql(conf.staging)
            done()
          })
          spawnProc.emit('close', 0)
        })

        it('pipes to deploy', function(done) {
          deploy.deployForEnv(conf, 'staging', [], function(err, args) {
            spawnArguments[1][1].should.be.a.String
            var pipeTo = spawnArguments[1][1].split(/\s*\|\s*/)[1]
            pipeTo.should.be.ok
            pipeTo.should.match(/\/deploy\s*$/)
            done()
          })
          spawnProc.emit('close', 0)
        })
      })

      context('with spawn errors', function() {
        it('calls back with the error stack, if present', function(done) {
          var error = { stack: 'this is my stack'}
          deploy.deployForEnv(conf, 'staging', [], function(err, args) {
            err.should.be.a.String
            err.should.eql(error.stack)
            done()
          })
          spawnProc.emit('error', error)
        })

        it('calls back with the error object, if no stack is present', function(done) {
          var error = { abc: 123 }
          deploy.deployForEnv(conf, 'staging', [], function(err, args) {
            err.should.be.an.Object
            err.should.eql(error)
            done()
          })
          spawnProc.emit('error', error)
        })
      })
    })
  })
})
