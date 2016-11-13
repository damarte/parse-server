const Parse = require("parse/node");
const request = require('request');
const AdmZip = require('adm-zip');
const dd = require('deep-diff');

describe('Export router', () => {
  it_exclude_dbs(['postgres'])('send success export mail', (done) => {

    let results = [];
    let headers = {
      'Content-Type': 'application/json',
      'X-Parse-Application-Id': 'test',
      'X-Parse-Master-Key': 'test'
    };

    let emailAdapter = {
      sendMail: ({text, link, to, subject}) => {

        expect(to).toEqual('my@email.com');
        expect(subject).toEqual('Export completed');

        request.get({ url: link, encoding: null }, function(err, res, zipFile) {

          if(err) throw err;

          let zip = new AdmZip(zipFile);
          let zipEntries = zip.getEntries();

          expect(zipEntries.length).toEqual(1);

          let entry = zipEntries.pop();
          let text = entry.getData().toString('utf8');
          let resultsToCompare = JSON.parse(text);

          expect(dd(results, resultsToCompare)).toEqual();

          done();
        });
      }
    }
    reconfigureServer({
      emailAdapter: emailAdapter
    })
    .then(() => {

      let ExportTest = Parse.Object.extend("ExportTest");
      let exportTest = new ExportTest();

      return exportTest
      .save({
        field1: 'value1',
        field2: 'value2',
      })
      .then(data => {
        request.get(
          {
            headers: headers,
            url: 'http://localhost:8378/1/classes/ExportTest',
          },
          (err, response, body) => {
            results = JSON.parse(body);
          }
        );

      });
    })
    .then(() => {

      request.put(
        {
          headers: headers,
          url: 'http://localhost:8378/1/export_data',
          body: JSON.stringify({
            name: 'ExportTest',
            feedbackEmail: 'my@email.com'
          })
        },
        (err, response, body) => {
          expect(err).toBe(null);
          expect(body).toEqual('"We are exporting your data. You will be notified by e-mail once it is completed."');
        }
      );
    });
  });
});
