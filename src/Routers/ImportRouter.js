import express          from 'express';
import * as middlewares from '../middlewares';
import multer           from 'multer';
import rest             from '../rest';
import bluebird         from 'bluebird';

function handleImport(req, res) {
  let restObjects = [];
  let importFile;
  try {
    importFile = JSON.parse(req.file.buffer.toString());
  } catch (e) {
    res.status(400);
    res.json({ response: 'Failed to parse JSON based on the file sent' });
    return;
  }
  
  if (Array.isArray(importFile)) {
    restObjects = importFile;
  } else if (Array.isArray(importFile.results)) {
    restObjects = importFile.results;
  } else if (Array.isArray(importFile.rows)) {
    restObjects = importFile.rows;
  }

  if (!restObjects) {
    res.status(400);
    res.json({ response: 'No data to import' });
    return;
  }

  if (req.body.feedbackEmail) {
    let emailControllerAdapter = req.config.emailControllerAdapter;
    if (!emailControllerAdapter) {
      res.status(400);
      res.json({ response: 'You have to setup a Mail Adapter.' });
      return;
    } else {
      res.status(200);
      res.json({response: 'We are importing your data. You will be notified by e-mail once it is completed.'});
    }
    bluebird.map(restObjects, importRestObject, { concurrency: 100 })
      .then(() => {
        emailControllerAdapter.sendMail({
          text: `We have successfully imported your data to the class ${req.params.className}.`,
          to: req.body.feedbackEmail,
          subject: 'Import completed'
        });
      })
      .catch((error) => {
        emailControllerAdapter.sendMail({
          text: `We could not import your data to the class ${req.params.className}. Error: ${error}`,
          to: req.body.feedbackEmail,
          subject: 'Import failed'
        });
      });
  } else {
    bluebird.map(restObjects, importRestObject, { concurrency: 100 })
      .then((results) => {
        res.status(200);
        res.json({response: results});
      })
      .catch((error) => {
        res.status(500);
        res.json({response: 'Internal server error: ' + error});
      });
  }

  function importRestObject(restObject) {
    if (restObject.createdAt) {
      delete restObject.createdAt;
    }
    if (restObject.updatedAt) {
      delete restObject.updatedAt;
    }
    if (restObject.objectId) {
      return rest
        .update(req.config, req.auth, req.params.className, restObject.objectId, restObject)
        .catch(function (error) {
          if (error.code === Parse.Error.OBJECT_NOT_FOUND) {
            return rest.create(
              req.config,
              req.auth,
              req.params.className,
              restObject,
              req.info.clientSDK,
              {allowObjectId: true}
            );
          } else {
            return Promise.reject(error);
          }
        });
    } else {
      return rest.create(req.config, req.auth, req.params.className, restObject);
    }
  }
}

export function getRouter() {
  let upload = multer();
  let router = express.Router();
  router.post(
    '/import_data/:className',
    upload.single('importFile'),
    middlewares.allowCrossDomain,
    middlewares.handleParseHeaders,
    middlewares.enforceMasterKeyAccess,
    (req, res) => { return handleImport(req, res); }
  );
  return router;
}
