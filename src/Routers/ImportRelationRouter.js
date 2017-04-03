import express          from 'express';
import * as middlewares from '../middlewares';
import multer           from 'multer';
import rest             from '../rest';
import bluebird         from 'bluebird';
import Parse            from 'parse/node';

function handleImportRelation(req, res) {
  let targetClass;

  function getOneSchema() {
    const className = req.params.className;
    return req.config.database.loadSchema({clearCache: true})
      .then(schemaController => schemaController.getOneSchema(className))
      .catch(error => {
        if (error === undefined) {
          return Promise.reject(new Parse.Error(Parse.Error.INVALID_CLASS_NAME,
            `Class ${className} does not exist.`));
        } else {
          return Promise.reject(new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR,
            'Database adapter error.'));
        }
      });
  }

  function importRestObject(restObject) {
    return rest.update(req.config, req.auth, req.params.className, restObject.owningId, {
      [req.params.relationName]: {
        "__op": "AddRelation",
        "objects": [{"__type": "Pointer", "className": targetClass, "objectId": restObject.relatedId}]
      }
    }, req.info.clientSDK)
    .catch(function (error) {
      if (error.code === Parse.Error.OBJECT_NOT_FOUND) {
        return Promise.reject(new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found'));
      } else {
        return Promise.reject(error);
      }
    });
  }

  return getOneSchema().then((response) => {
    if (!response.fields.hasOwnProperty(req.params.relationName)) {
      res.status(400);
      res.json({ response: `Relation ${req.params.relationName} does not exist in ${req.params.className}.` });
      return;
    } else if (response.fields[req.params.relationName].type !== 'Relation') {
      res.status(400);
      res.json({ response: `Class ${response.fields[req.params.relationName].targetClass} does not have Relation type.` });
      return;
    }

    targetClass = response.fields[req.params.relationName].targetClass;
    let importFile;
    let restObjects = [];
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
      const emailControllerAdapter = req.config.emailControllerAdapter;
      if (!emailControllerAdapter) {
        res.status(400);
        res.json({ response: 'You have to setup a Mail Adapter.' });
        return;
      } else {
        res.status(200);
        res.json({response: 'We are importing your data. You will be notified by e-mail once it is completed.'});
      }
      bluebird.map(restObjects, importRestObject, {concurrency: 100})
        .then(() => {
          emailControllerAdapter.sendMail({
            text: `We have successfully imported your data to the class ${req.params.className}, relation ${req.params.relationName}.`,
            to: req.body.feedbackEmail,
            subject: 'Import completed'
          });
        })
        .catch((error) => {
          emailControllerAdapter.sendMail({
            text: `We could not import your data to the class ${req.params.className}, relation ${req.params.relationName}. Error: ${error}`,
            to: req.body.feedbackEmail,
            subject: 'Import failed'
          });
        });
    } else {
      bluebird.map(restObjects, importRestObject, {concurrency: 100})
        .then((results) => {
          res.status(200);
          res.json({response: results});
        })
        .catch((error) => {
          res.status(500);
          res.json({response: 'Internal server error: ' + error});
        });
    }
  }).catch((error) => {
    res.status(400);
    res.json({response: 'It was not possible to import your data: ' + error});
  });
}

export function getRouter() {
  const upload = multer();
  const router = express.Router();
  router.post(
    '/import_relation_data/:className/:relationName',
    upload.single('importFile'),
    middlewares.allowCrossDomain,
    middlewares.handleParseHeaders,
    middlewares.enforceMasterKeyAccess,
    (req, res) => { return handleImportRelation(req, res); }
  );
  return router;
}
