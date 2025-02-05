H5P.Column = (function (EventDispatcher) {

  /**
   * Column Constructor
   *
   * @class
   * @param {Object} params Describes task behavior
   * @param {number} id Content identifier
   * @param {Object} data User specific data to adapt behavior
   */
  function Column(params, id, data) {
    /** @alias H5P.Column# */
    var self = this;

    // We support events by extending this class
    EventDispatcher.call(self);

    // Add defaults
    params = params || {};
    if (params.useSeparators === undefined) {
      params.useSeparators = true;
    }

    this.contentData = data;

    // Column wrapper element
    var wrapper;

    // H5P content in the column
    var instances = [];
    var instanceContainers = [];

    var skipped = [];

    // Number of tasks among instances
    var numTasks = 0;

    // Number of tasks that has been completed
    var numTasksCompleted = 0;

    // Keep track of result for each task
    var tasksResultEvent = [];

    // Keep track of last content's margin state
    var previousHasMargin;

    /**
     * Calculate score and trigger completed event.
     *
     * @private
     */
    var completed = function () {
      // Sum all scores
      var raw = 0;
      var max = 0;

      for (var i = 0; i < tasksResultEvent.length; i++) {
        var event = tasksResultEvent[i];
        raw += event.getScore();
        max += event.getMaxScore();
      }

      if(max === 0) {
        max += 1;
      }

      self.triggerXAPIScored(raw, max, 'completed');
    };

    /**
     * Generates an event handler for the given task index.
     *
     * @private
     * @param {number} taskIndex
     * @return {function} xAPI event handler
     */
    var trackScoring = function (taskIndex) {
      return function (event) {
        if (event.getScore() === null) {
          return; // Skip, not relevant
        }

        if (tasksResultEvent[taskIndex] === undefined) {
          // Update number of completed tasks
          numTasksCompleted++;
        }

        // Keep track of latest event with result
        tasksResultEvent[taskIndex] = event;

        // Track progress
        var progressed = self.createXAPIEventTemplate('progressed');
        progressed.data.statement.object.definition.extensions['http://id.tincanapi.com/extension/ending-point'] = taskIndex + 1;
        self.trigger(progressed);

        // Check to see if we're done
        if (numTasksCompleted === numTasks) {
          // Run this after the current event is sent
          setTimeout(function () {
            completed(); // Done
          }, 0);
        }
      };
    };

    /**
     * Creates a new ontent instance from the given content parameters and
     * then attaches it the wrapper. Sets up event listeners.
     *
     * @private
     * @param {Object} content Parameters
     * @param {Object} [contentData] Content Data
     */
    var addRunnable = function (content, contentData) {
      // Create container for content
      var container = document.createElement('div');
      container.classList.add('h5p-column-content');

      // Content overrides
      var library = content.library.split(' ')[0];
      if (library === 'H5P.Video') {
        // Prevent video from growing endlessly since height is unlimited.
        content.params.visuals.fit = false;
      }

      // Create content instance
      var instance = H5P.newRunnable(content, id, undefined, true, contentData);

      // Bubble resize events
      bubbleUp(instance, 'resize', self);

      // Check if instance is a task
      if (Column.isTask(instance)) {
        // Tasks requires completion

        instance.on('xAPI', trackScoring(numTasks));
        numTasks++;
      }

      if (library === 'H5P.Image' || library === 'H5P.TwitterUserFeed') {
        // Resize when images are loaded

        instance.on('loaded', function () {
          self.trigger('resize');
        });
      }

      // Keep track of all instances
      instances.push(instance);
      instanceContainers.push({
        hasAttached: false,
        container: container,
        instanceIndex: instances.length - 1,
      });

      // Add to DOM wrapper
      wrapper.appendChild(container);
    };

    /**
     * Help get data for content at given index
     *
     * @private
     * @param {number} index
     * @returns {Object} Data object with previous state
     */
    var grabContentData = function (index) {
      var contentData = {
        parent: self
      };

      if (data.previousState && data.previousState.instances && data.previousState.instances[index]) {
        contentData.previousState = data.previousState.instances[index];
      }

      return contentData;
    };

    /**
     * Adds separator before the next content.
     *
     * @private
     * @param {string} libraryName Name of the next content type
     * @param {string} useSeparator
     */
    var addSeparator = function (libraryName, useSeparator) {
      // Determine separator spacing
      var thisHasMargin = (hasMargins.indexOf(libraryName) !== -1);

      // Only add if previous content exists
      if (previousHasMargin !== undefined) {

        // Create separator element
        var separator = document.createElement('div');
        //separator.classList.add('h5p-column-ruler');

        // If no margins, check for top margin only
        if (!thisHasMargin && (hasTopMargins.indexOf(libraryName) === -1)) {
          if (!previousHasMargin) {
            // None of them have margin

            // Only add separator if forced
            if (useSeparator === 'enabled') {
              // Add ruler
              separator.classList.add('h5p-column-ruler');

              // Add space both before and after the ruler
              separator.classList.add('h5p-column-space-before-n-after');
            }
            else {
              // Default is to separte using a single space, no ruler
              separator.classList.add('h5p-column-space-before');
            }
          }
          else {
            // We don't have any margin but the previous content does

            // Only add separator if forced
            if (useSeparator === 'enabled') {
              // Add ruler
              separator.classList.add('h5p-column-ruler');

              // Add space after the ruler
              separator.classList.add('h5p-column-space-after');
            }
          }
        }
        else if (!previousHasMargin) {
          // We have margin but not the previous content doesn't

          // Only add separator if forced
          if (useSeparator === 'enabled') {
            // Add ruler
            separator.classList.add('h5p-column-ruler');

            // Add space after the ruler
            separator.classList.add('h5p-column-space-before');
          }
        }
        else {
          // Both already have margin

          if (useSeparator !== 'disabled') {
            // Default is to add ruler unless its disabled
            separator.classList.add('h5p-column-ruler');
          }
        }

        // Insert into DOM
        wrapper.appendChild(separator);
      }

      // Keep track of spacing for next separator
      previousHasMargin = thisHasMargin || (hasBottomMargins.indexOf(libraryName) !== -1);
    };

    /**
     * Check the instances all are only if read only return false and not show summary
     * if instance contain scorable or open response then return true
     * @returns {boolean}
     */
    var showSummary = function () {
      var hasNonReadOnlyActivities = false;
      for (const inst of instances) {
        const machineName = inst.libraryInfo.machineName;
        if (readOnlyActivities.includes(machineName)
            || (['H5P.InteractiveVideo', 'H5P.CoursePresentation'].includes(machineName) && !Column.isTask(inst))) {
          continue;
        }
        hasNonReadOnlyActivities = true;
      }
      return hasNonReadOnlyActivities;
    };

    /**
     * Creates a` wrapper and the column content the first time the column
     * is attached to the DOM.
     *
     * @private
     */
    var createHTML = function () {
      // Create wrapper
      wrapper = document.createElement('div');

      // Go though all contents
      for (var i = 0; i < params.content.length; i++) {
        var content = params.content[i];

        // In case the author has created an element without selecting any
        // library
        if (content.content === undefined) {
          continue;
        }

        if (params.useSeparators) { // (check for global override)

          // Add separator between contents
          addSeparator(content.content.library.split(' ')[0], content.useSeparator);
        }

        // Add content
        addRunnable(content.content, grabContentData(i));
      }
      if(typeof data.parent == "undefined" && showSummary()) {
        H5P.JoubelUI.createButton({
          class: "view-summary h5p-column-summary",
          html: 'View Summary',
          on: {
              click: function () {
                H5P.jQuery('.custom-summary-section').remove();
                H5P.jQuery('.submit-answers').remove();
                
                  var confirmationDialog = new H5P.ConfirmationDialog({
                    headerText: 'Column Layout Summary',
                    dialogText: createSummary(wrapper,tasksResultEvent),
                    cancelText: 'Cancel',
                    confirmText: "Submit Answers"
                  });
                  confirmationDialog.on('confirmed', function () {
                    //self.removeGoal($removeContainer);
                    // Set focus to add new goal button
                    //self.$createGoalButton.focus();
                    var rawwa = 0;
                    var maxwa = 0;
                    console.log(tasksResultEvent);
                    for (var m = 0; m < tasksResultEvent.length; m++) {
                      var eventwa = tasksResultEvent[m];
                      if(typeof eventwa != "undefined"){
                        rawwa += eventwa.getScore();
                        maxwa += eventwa.getMaxScore();
                      }
                      
                    }
                    if(maxwa === 0) {
                      maxwa += 1;
                    }
                    self.triggerXAPIScored(rawwa, maxwa, 'submitted-curriki');
                    console.log(skipped);
                    for(skip_rec of skipped) {
                      console.log('skipped');
                      //skip_rec.triggerXAPIScored(rawwa, maxwa, 'skipped');
                      const customProgressedEvent = skip_rec.createXAPIEventTemplate('skipped');
            
                      if (customProgressedEvent.data.statement.object) {
                        //customProgressedEvent.data.statement.object.definition['name'] = {'en-US': skip_rec.contentData.metadata.title};
                        console.log(customProgressedEvent);
                        //section.instance.triggerXAPIScored(0,1,customProgressedEvent);
                        skip_rec.trigger(customProgressedEvent);
                      }

                    }
                  });
          
                  confirmationDialog.appendTo(parent.document.body);
                  confirmationDialog.show();
                  //H5P.jQuery(window.parent).scrollTop(0); 
                  H5P.jQuery(".h5p-confirmation-dialog-popup").css("top", "80%"); 
              },
          },
          appendTo: wrapper,
      });
      }
      
    };

    

    /**
     * Attach the column to the given container
     *
     * @param {H5P.jQuery} $container
     */
    self.attach = function ($container) {
      if (wrapper === undefined) {
        // Create wrapper and content
        createHTML();
      }

      // Attach instances that have not been attached
      instanceContainers.filter(function (container) { return !container.hasAttached })
        .forEach(function (container) {
          instances[container.instanceIndex]
            .attach(H5P.jQuery(container.container));

          // Remove any fullscreen buttons
          disableFullscreen(instances[container.instanceIndex]);
        });


      // Add to DOM
      $container.addClass('h5p-column').html('').append(wrapper);

      // If none of the children instances is a task, fire off a completed
      // xAPI event
      setTimeout(() => {
        console.log('Checking if any of the column children are tasks...');
        for (var i = 0; i < instances.length; i++) {
          if(Column.isTask(instances[i])) {
            console.log('Found task.');
            return;
          }
        }
        console.log('No tasks found. Marking activity as completed.');
        completed();
      }, 1000);
    };

    /**
     * Create object containing information about the current state
     * of this content.
     *
     * @return {Object}
     */
    self.getCurrentState = function () {
      // Get previous state object or create new state object
      var state = (data.previousState ? data.previousState : {});
      if (!state.instances) {
        state.instances = [];
      }

      // Grab the current state for each instance
      for (var i = 0; i < instances.length; i++) {
        var instance = instances[i];

        if (instance.getCurrentState instanceof Function ||
            typeof instance.getCurrentState === 'function') {

          state.instances[i] = instance.getCurrentState();
        }
      }

      // Done
      return state;
    };

    /**
     * Get xAPI data.
     * Contract used by report rendering engine.
     *
     * @see contract at {@link https://h5p.org/documentation/developers/contracts#guides-header-6}
     */
    self.getXAPIData = function () {
      var xAPIEvent = self.createXAPIEventTemplate('answered');
      addQuestionToXAPI(xAPIEvent);
      xAPIEvent.setScoredResult(self.getScore(),
        self.getMaxScore(),
        self,
        true,
        self.getScore() === self.getMaxScore()
      );
      return {
        statement: xAPIEvent.data.statement,
        children: getXAPIDataFromChildren(instances)
      };
    };

    /**
     * Get score for all children
     * Contract used for getting the complete score of task.
     *
     * @return {number} Score for questions
     */
    self.getScore = function () {
      return instances.reduce(function (prev, instance) {
        return prev + (instance.getScore ? instance.getScore() : 0);
      }, 0);
    };

    /**
     * Get maximum score possible for all children instances
     * Contract.
     *
     * @return {number} Maximum score for questions
     */
    self.getMaxScore = function () {
      return instances.reduce(function (prev, instance) {
        return prev + (instance.getMaxScore ? instance.getMaxScore() : 0);
      }, 0);
    };

    /**
     * Get answer given
     * Contract.
     *
     * @return {boolean} True, if all answers have been given.
     */
    self.getAnswerGiven = function () {
      return instances.reduce(function (prev, instance) {
        return prev && (instance.getAnswerGiven ? instance.getAnswerGiven() : prev);
      }, true);
    };

    /**
     * Show solutions.
     * Contract.
     */
    self.showSolutions = function () {
      instances.forEach(function (instance) {
        if (instance.toggleReadSpeaker) {
          instance.toggleReadSpeaker(true);
        }
        if (instance.showSolutions) {
          instance.showSolutions();
        }
        if (instance.toggleReadSpeaker) {
          instance.toggleReadSpeaker(false);
        }
      });
    };

    /**
     * Reset task.
     * Contract.
     */
    self.resetTask = function () {
      instances.forEach(function (instance) {
        if (instance.resetTask) {
          instance.resetTask();
        }
      });
    };

    /**
     * Get instances for all children
     * TODO: This is not a good interface, we should provide handling needed
     * handling of the tasks instead of repeating them for each parent...
     *
     * @return {Object[]} array of instances
     */
    self.getInstances = function () {
      return instances;
    };

    /**
     * Get title, e.g. for xAPI when Column is subcontent.
     *
     * @return {string} Title.
     */
    self.getTitle = function () {
      return H5P.createTitle((self.contentData && self.contentData.metadata && self.contentData.metadata.title) ? self.contentData.metadata.title : 'Column');
    };

    /**
     * Add the question itself to the definition part of an xAPIEvent
     */
    var addQuestionToXAPI = function (xAPIEvent) {
      var definition = xAPIEvent.getVerifiedStatementValue(['object', 'definition']);
      H5P.jQuery.extend(definition, getxAPIDefinition());
    };

    /**
     * Generate xAPI object definition used in xAPI statements.
     * @return {Object}
     */
    var getxAPIDefinition = function () {
      var definition = {};

      definition.interactionType = 'compound';
      definition.type = 'http://adlnet.gov/expapi/activities/cmi.interaction';
      definition.description = {
        'en-US': ''
      };

      return definition;
    };

    var createSummary = function (wrapper,tasksResultEvent) {
        
        var table_content = '<tbody>';
      
        var i=0;
        for(const inst of instances) {
          // Do not show read only activities in summary
          const machineName = inst.libraryInfo.machineName;
          if (readOnlyActivities.includes(machineName)
              || (['H5P.InteractiveVideo', 'H5P.CoursePresentation'].includes(machineName) && !Column.isTask(inst)) ) {
            i++;
            continue;
          }

          var param_content = params.content[i];
          var content_type = param_content.content.metadata.contentType;
          
          /*if( typeof inst.getAnswerGiven == "function" && (inst.getAnswerGiven() != undefined || !inst.getAnswerGiven())) {
            console.log('563');
            skipped.push(inst);
            table_content += printSkippedTr(param_content.content.metadata.title);
            
            i++;
            continue;
          }
          
          if(content_type == "Course Presentation" || content_type == "Interactive Video" || content_type == "Questionnaire") {
            
                var cpTaskDone = checkSkippedStatus(inst,content_type);
                
                if(!cpTaskDone) {
                  skipped.push(inst);
                  table_content +=printSkippedTr(param_content.content.metadata.title);
                  i++;
                  continue;
                }
          }*/

        if(typeof inst.getScore == "undefined") {
            var cust_score = 0;
            var cust_max_score = 0;

        }else {
          var cust_score = inst.getScore();
          var cust_max_score = inst.getMaxScore();
        }
        table_content += '<tr>';
        table_content += '<td>'+param_content.content.metadata.title+'</td>';
        table_content += '<td style="text-align:right;">'+cust_score+'/'+cust_max_score+'</td>';
        table_content += '</tr>';
        i++;
      } 
      table_content += '</tbody>';
     
      var summary_html = '<div class="custom-summary-section"><div class="h5p-summary-table-pages"><table class="h5p-score-table-custom" style="min-height:100px;width:100%;"><thead><tr><th>Content</th><th style="text-align:right;">Score/Total</th></tr></thead>'+table_content+'</table></div></div>';
      
      return summary_html;
      
      
    };

    /**
     * To print the skipped elem tr
     * @param {*} title 
     */
    function printSkippedTr(title) {
      
          var table_content = '<tr>';
          table_content += '<td>'+title+'  (Skipped) </td>';
          table_content += '<td style="text-align:right;">0/0</td>';
          table_content += '</tr>';
         return table_content;
         
    }


    /**
     * To check if the instances has been skipped or not
     * @param {*} instances 
     * @param {*} type 
     */
    function checkSkippedStatus(instances, type) {
      if(type == "Interactive Video") {
        for (const iv_interaction of instances.interactions) {
          if(typeof iv_interaction.getLastXAPIVerb() != "undefined") {
            console.log(iv_interaction.getLastXAPIVerb());
            return true;
          }
        }
        return false;

      }else if(type == "Course Presentation") {
        console.log(instances.slidesWithSolutions);
        for (const slide of instances.slidesWithSolutions) {
          if(typeof slide === "undefined" || slide == ""){
            continue;
          }
          for(const item of slide) {
            if(typeof item.getAnswerGiven === "function" && item.getAnswerGiven()){
              
              return true;
            }else if(typeof item.getAnswerGiven == 'undefined'  ) {
              var flag = 0;
              item.interactions.forEach(function(pp,mm){ 
                  console.log(pp.getLastXAPIVerb());
                  if(pp.getLastXAPIVerb() !== undefined) {
                      flag = 1;
                  }
              })
            if(flag == 0) {  
              return true;
            }

          }
          }
        }
        return false;
      } else if(type == "Questionnaire") {
        for (const elem of instances.state.questionnaireElements) {
      
          if(elem.answered){
            console.log(elem.answered);
            return true;
          }
        
      }
      return false;
      }
    }

    /**
     * Get xAPI data from sub content types
     *
     * @param {Array} of H5P instances
     * @returns {Array} of xAPI data objects used to build a report
     */
    var getXAPIDataFromChildren = function (children) {
      return children.map(function (child) {
        if (typeof child.getXAPIData == 'function') {
          return child.getXAPIData();
        }
      }).filter(function (data) {
        return !!data;
      });
    };

    // Resize children to fit inside parent
    bubbleDown(self, 'resize', instances);

    if (wrapper === undefined) {
      // Create wrapper and content
      createHTML();
    }

    self.setActivityStarted();
  }

  Column.prototype = Object.create(EventDispatcher.prototype);
  Column.prototype.constructor = Column;

  /**
   * Makes it easy to bubble events from parent to children
   *
   * @private
   * @param {Object} origin Origin of the Event
   * @param {string} eventName Name of the Event
   * @param {Array} targets Targets to trigger event on
   */
  function bubbleDown(origin, eventName, targets) {
    origin.on(eventName, function (event) {
      if (origin.bubblingUpwards) {
        return; // Prevent send event back down.
      }

      for (var i = 0; i < targets.length; i++) {
        targets[i].trigger(eventName, event);
      }
    });
  }

  /**
   * Makes it easy to bubble events from child to parent
   *
   * @private
   * @param {Object} origin Origin of the Event
   * @param {string} eventName Name of the Event
   * @param {Object} target Target to trigger event on
   */
  function bubbleUp(origin, eventName, target) {
    origin.on(eventName, function (event) {
      // Prevent target from sending event back down
      target.bubblingUpwards = true;

      // Trigger event
      target.trigger(eventName, event);

      // Reset
      target.bubblingUpwards = false;
    });
  }

  /**
   * Definition of which content types are tasks
   */
  var isTasks = [
    'H5P.ImageHotspotQuestion',
    'H5P.Blanks',
    'H5P.Essay',
    'H5P.SingleChoiceSet',
    'H5P.MultiChoice',
    'H5P.TrueFalse',
    'H5P.DragQuestion',
    'H5P.Summary',
    'H5P.DragText',
    'H5P.MarkTheWords',
    'H5P.MemoryGame',
    'H5P.QuestionSet',
    'H5P.InteractiveVideo',
    'H5P.CoursePresentation',
    'H5P.DocumentationTool'
  ];


  /**
   * Definition of which content types are read only
   */
  var readOnlyActivities = [
    'H5P.Accordion',
    'H5P.Agamotto',
    'H5P.Audio',
    'H5P.AudioRecorder',
    'H5P.Chart',
    'H5P.Collage',
    'H5P.Dialogcards',
    'H5P.GuessTheAnswer',
    'H5P.Table',
    'H5P.IFrameEmbed',
    'H5P.Image',
    'H5P.ImageHotspots',
    'H5P.Link',
    'H5P.MemoryGame',
    'H5P.Timeline',
    'H5P.TwitterUserFeed',
    'H5P.Video',
    'H5P.PhetInteractiveSimulation',
    'H5P.DocumentationTool',
    'H5P.AdvancedText',
    'H5P.DocumentsUpload'
  ];

  /**
   * Check if the given content instance is a task (will give a score)
   *
   * @param {Object} instance
   * @return {boolean}
   */
  Column.isTask = function (instance) {
    if (instance.isTask !== undefined) {
      return instance.isTask; // Content will determine self if it's a task
    }

    // Go through the valid task names
    for (var i = 0; i < isTasks.length; i++) {
      // Check against library info. (instanceof is broken in H5P.newRunnable)
      if (instance.libraryInfo.machineName === isTasks[i]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Definition of which content type have margins
   */
  var hasMargins = [
    'H5P.AdvancedText',
    'H5P.AudioRecorder',
    'H5P.Essay',
    'H5P.Link',
    'H5P.Accordion',
    'H5P.Table',
    'H5P.GuessTheAnswer',
    'H5P.Blanks',
    'H5P.MultiChoice',
    'H5P.TrueFalse',
    'H5P.DragQuestion',
    'H5P.Summary',
    'H5P.DragText',
    'H5P.MarkTheWords',
    'H5P.ImageHotspotQuestion',
    'H5P.MemoryGame',
    'H5P.Dialogcards',
    'H5P.QuestionSet',
    'H5P.DocumentationTool'
  ];

  /**
   * Definition of which content type have top margins
   */
  var hasTopMargins = [
    'H5P.SingleChoiceSet'
  ];

  /**
   * Definition of which content type have bottom margins
   */
  var hasBottomMargins = [
    'H5P.CoursePresentation',
    'H5P.Dialogcards',
    'H5P.GuessTheAnswer',
    'H5P.ImageSlider'
  ];

  /**
   * Remove custom fullscreen buttons from sub content.
   * (A bit of a hack, there should have been some sort of override…)
   *
   * @param {Object} instance
   */
  function disableFullscreen(instance) {
    switch (instance.libraryInfo.machineName) {
      case 'H5P.CoursePresentation':
        if (instance.$fullScreenButton) {
          instance.$fullScreenButton.remove();
        }
        break;

      case 'H5P.InteractiveVideo':
        instance.on('controls', function () {
          if (instance.controls.$fullscreen) {
            instance.controls.$fullscreen.remove();
          }
        });
        break;
    }
  }

  return Column;
})(H5P.EventDispatcher);
