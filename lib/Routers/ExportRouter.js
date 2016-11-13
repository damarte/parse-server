'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ExportRouter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _PromiseRouter2 = require('../PromiseRouter');

var _PromiseRouter3 = _interopRequireDefault(_PromiseRouter2);

var _middlewares = require('../middlewares');

var middleware = _interopRequireWildcard(_middlewares);

var _rest = require('../rest');

var _rest2 = _interopRequireDefault(_rest);

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _admZip = require('adm-zip');

var _admZip2 = _interopRequireDefault(_admZip);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var ExportRouter = exports.ExportRouter = function (_PromiseRouter) {
  _inherits(ExportRouter, _PromiseRouter);

  function ExportRouter() {
    _classCallCheck(this, ExportRouter);

    return _possibleConstructorReturn(this, (ExportRouter.__proto__ || Object.getPrototypeOf(ExportRouter)).apply(this, arguments));
  }

  _createClass(ExportRouter, [{
    key: 'handleExportProgress',
    value: function handleExportProgress(req) {
      return Promise.resolve({ response: 100 });
    }
  }, {
    key: 'handleExport',
    value: function handleExport(req) {

      var data = req.body;

      _rest2.default.find(req.config, req.auth, data.name, data.where).then(function (results) {
        var zip = new _admZip2.default();
        zip.addFile(data.name + '.json', new Buffer(JSON.stringify(results, null, 2)));
        return zip.toBuffer();
      }).then(function (zippedFile) {
        var filesController = req.config.filesController;
        return filesController.createFile(req.config, data.name, zippedFile, 'application/zip');
      }).then(function (fileData) {

        var emailControllerAdapter = req.config.emailControllerAdapter;

        if (!emailControllerAdapter) {
          return Promise.reject(new Error('You have to setup a Mail Adapter.'));
        }

        return emailControllerAdapter.sendMail({
          text: 'We have successfully exported your data from the class ' + data.name + '.\n\n        Please download from ' + fileData.url,
          link: fileData.url,
          to: req.body.feedbackEmail,
          subject: 'Export completed'
        });
      }).catch(function (error) {
        console.log(error);
        return emailControllerAdapter.sendMail({
          text: 'We could not export your data to the class ' + data.name + '. Error: ' + error,
          to: req.body.feedbackEmail,
          subject: 'Export failed'
        });
      });

      return Promise.resolve({ response: 'We are exporting your data. You will be notified by e-mail once it is completed.' });
    }
  }, {
    key: 'mountRoutes',
    value: function mountRoutes() {
      var _this2 = this;

      this.route('PUT', '/export_data', function (req) {
        return _this2.handleExport(req);
      });

      this.route('GET', '/export_progress', function (req) {
        return _this2.handleExportProgress(req);
      });
    }
  }]);

  return ExportRouter;
}(_PromiseRouter3.default);

exports.default = ExportRouter;