import PromiseRouter   from '../PromiseRouter';
import * as middleware from '../middlewares';
import rest            from '../rest';
import bluebird        from 'bluebird';
import AdmZip          from 'adm-zip';

export class ExportRouter extends PromiseRouter {

  handleExportProgress(req) {
    return Promise.resolve({ response: 100 });   
  }

  handleExport(req) {

    let data = req.body;


    rest.find(req.config, req.auth, data.name,  data.where)
    .then((results) => {
      let zip  = new AdmZip();
      zip.addFile(`${data.name}.json`, new Buffer(JSON.stringify(results, null, 2)));
      return zip.toBuffer();
    })
    .then((zippedFile) => {
      const filesController = req.config.filesController;
      return filesController.createFile(req.config, data.name, zippedFile, 'application/zip');
    })
    .then((fileData) => {

      let emailControllerAdapter = req.config.emailControllerAdapter;

      if (!emailControllerAdapter) {
        return Promise.reject(new Error('You have to setup a Mail Adapter.'));
      }

      return emailControllerAdapter.sendMail({
        text: `We have successfully exported your data from the class ${data.name}.\n
        Please download from ${fileData.url}`,
        link: fileData.url,
        to: req.body.feedbackEmail,
        subject: 'Export completed'
      });
    })
    .catch((error) => {
      console.log(error);
      return emailControllerAdapter.sendMail({
        text: `We could not export your data to the class ${data.name}. Error: ${error}`,
        to: req.body.feedbackEmail,
        subject: 'Export failed'
      });
    });

    return Promise.resolve({response: 'We are exporting your data. You will be notified by e-mail once it is completed.'});
  }

  mountRoutes() {
    this.route(
      'PUT',
      '/export_data',
      (req) => { return this.handleExport(req); }
    );

    this.route(
      'GET',
      '/export_progress',
      (req) => { return this.handleExportProgress(req); }
    );

  }
}

export default ExportRouter;
