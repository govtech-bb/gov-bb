---
format: "govbb-form"
formatVersion: 2
title: "Apply for a permit to play loud music"
formId: "loud-music-permit"
description: "Apply for a permit to play amplified music at an event."
contactDetails:
  title: "Permits Office"
  telephoneNumber: "+1 (246) 555-0100"
  email: "permits@example.gov.bb"
meta:
  visibility: "draft"
---

# Tell us about the event

::page{#apply-for-a-permit-to-play-loud-music pageId="event"}

::description[We use this to check that amplified music is allowed where and when you plan it.]

::block{#use-this-form-to-apply-for-a-permit-for-an-event-with-amplif}
Use this form to apply for a permit for an event with amplified music.

::block{#you-will-need}
You will need\:

::block{#paragraph}
::empty

::block{#the-date-and-address-of-the-event}
- the date and address of the event

::block{#a-site-plan-if-you-need-to-close-a-road}
- a site plan if you need to close a road

::text[Event name]{#event-name fieldId="event-name" required}
::error{rule="required" message="Enter an answer"}

::dropdown[Which parish is the event in?]{#event-parish fieldId="event-parish" required}
::error{rule="required" message="Enter an answer"}
- :option[Christ Church]{#christ-church optionValue="Christ Church"}
- :option[Saint Michael]{#saint-michael optionValue="Saint Michael"}

::date[Event date]{#event-date fieldId="event-date" required relativeDate="futureOrToday"}
::hint[For example, 27 3 2026]
::error{rule="required" message="Enter an answer"}
::error{rule="dateAfter" message="Enter today or a future date"}

::text[National Identification (ID) number]{#national-id-number fieldId="national-id-number" required width="medium" mask="999999-9999" pattern="^\\d{6}-\\d{4}$"}
::hint[This is on your National Registration card. For example, 900314-0052]
::error{rule="required" message="Enter your National ID number"}
::error{rule="pattern" message="Enter a valid National ID number (for example, 900314-0052)"}

:::show-hide[Use passport number instead]{#use-passport-number-instead}

::block{#if-you-don-t-have-a-national-id-number-you-can-use-your-pass}
If you don’t have a National ID number, you can use your passport number instead.

::text[Passport number]{#passport-number fieldId="passport-number" required width="short" hasMinCharacters minCharacters="6"}
::error{rule="required" message="Enter passport number"}
::error{rule="minLength" message="Passport number must be at least 6 characters"}

:::

---

# Road closure

::page{#page-break pageId="road-closure"}

::multiple-choice[Do you need to close a road?]{#close-road fieldId="close-road" required}
::error{rule="required" message="Enter an answer"}
- :option[Yes]{#yes optionValue="Yes"}

  ::text[How long will the road be closed?]{#closure-duration fieldId="closure-duration" required hidden}
  ::error{rule="required" message="Enter an answer"}

  ::block{#apply-at-least-14-days-before-the-event-if-you-need-to-close}
  ::warning[Apply at least 14 days before the event if you need to close a road.]

- :option[No]{#no optionValue="No"}

:::logic{#conditional-logic}
```json
{
  "native": {
    "id": "closure-follow-up",
    "rules": [
      {
        "id": "show-closure",
        "when": {
          "op": "selected",
          "question": "close-road",
          "option": "yes"
        },
        "actions": [
          {
            "type": "setVisible",
            "targets": [
              "closure-duration",
              "closure-warning"
            ],
            "value": true
          }
        ]
      }
    ],
    "type": "logic"
  }
}
```
:::

::long-answer[Which roads?]{#roads fieldId="roads" required="false"}
::error{rule="required" message="Enter the roads"}

::file-upload[Upload a site plan]{#site-plan fieldId="site-plan" required}
::error{rule="required" message="Enter an answer"}

---

# Sound systems

::page{#page-break-2 pageId="sound-systems"}

::text[Type of sound system]{#sound-type fieldId="sound-type" required}
::error{rule="required" message="Enter an answer"}

::number[Number of speakers]{#speakers fieldId="speakers" required}
::error{rule="required" message="Enter an answer"}

::text[Speaker brand]{#speaker-brand fieldId="speaker-brand" required}
::error{rule="required" message="Enter an answer"}

---

# Check your answers

::page{#page-break-3 type="check-answers" pageId="review"}

---

# Declaration

::page{#page-break-4 type="declaration" pageId="declaration"}

::checkboxes[Declaration]{#declaration-confirmation fieldId="declaration-confirmation" required}
::error{rule="required" message="You must confirm the declaration to continue"}
- :option[I confirm the information I have given is correct]{#i-confirm-the-information-i-have-given-is-correct optionValue="confirmed"}

---

# Application sent

::page{#page-break-5 type="confirmation" pageId="confirmation"}

::block{#application-sent-2}
::title[Application sent]

::block{#we-will-email-you-within-5-working-days}
We will email you within 5 working days.

::block{#what-happens-next}
## What happens next

::block{#paragraph-2}
::empty

::block{#we-check-your-application}
1. We check your application.

::block{#we-may-call-you-to-ask-about-the-event}
1. We may call you to ask about the event.

::block{#we-email-you-your-permit}
1. We email you your permit.

:::source-state
```json
{
  "pages": {
    "apply-for-a-permit-to-play-loud-music": {
      "start": {
        "state": {
          "native": {
            "page": {
              "id": "event",
              "type": "page",
              "role": "questions"
            },
            "version": 1,
            "form": {
              "schemaVersion": 2,
              "id": "loud-music-permit",
              "mode": "application",
              "locale": "en-BB",
              "timeZone": "America/Barbados",
              "description": "Apply for a permit to play amplified music at an event.",
              "settings": {
                "visibility": "draft",
                "hiddenAnswers": "retain",
                "contact": {
                  "title": "Permits Office",
                  "telephoneNumber": "+1 (246) 555-0100",
                  "email": "permits@example.gov.bb"
                }
              }
            }
          }
        },
        "identity": "form:loud-music-permit"
      },
      "title": {
        "state": {
          "native": {
            "owner": "event"
          }
        },
        "identity": "title:event"
      },
      "description": {
        "state": {
          "native": {
            "owner": "event"
          }
        },
        "identity": "description:event"
      }
    },
    "page-break": {
      "start": {
        "state": {
          "native": {
            "page": {
              "id": "road-closure",
              "type": "page",
              "role": "questions"
            }
          }
        },
        "identity": "road-closure"
      },
      "title": {
        "state": {
          "native": {
            "owner": "road-closure"
          }
        },
        "identity": "title:road-closure"
      }
    },
    "page-break-2": {
      "settings": {
        "repeatable": {
          "min": 1,
          "max": 5,
          "addAnotherLabel": "Add another sound system",
          "instanceLabel": "Sound system"
        }
      },
      "start": {
        "state": {
          "native": {
            "page": {
              "id": "sound-systems",
              "type": "page",
              "role": "questions",
              "repeat": {
                "key": "sound-systems",
                "min": 1,
                "max": 5,
                "itemLabel": "Sound system",
                "addLabel": "Add another sound system"
              }
            }
          }
        },
        "identity": "sound-systems"
      },
      "title": {
        "state": {
          "native": {
            "owner": "sound-systems"
          }
        },
        "identity": "title:sound-systems"
      }
    },
    "page-break-3": {
      "start": {
        "state": {
          "native": {
            "page": {
              "id": "review",
              "type": "page",
              "role": "review",
              "review": {
                "questions": "preceding",
                "emptyAnswers": "omit",
                "changeLinks": true
              }
            }
          }
        },
        "identity": "review"
      },
      "title": {
        "state": {
          "native": {
            "owner": "review"
          }
        },
        "identity": "title:review"
      }
    },
    "page-break-4": {
      "start": {
        "state": {
          "native": {
            "page": {
              "id": "declaration",
              "type": "page",
              "role": "declaration"
            }
          }
        },
        "identity": "declaration"
      },
      "title": {
        "state": {
          "native": {
            "owner": "declaration"
          }
        },
        "identity": "title:declaration"
      }
    },
    "page-break-5": {
      "start": {
        "state": {
          "native": {
            "page": {
              "id": "confirmation",
              "type": "page",
              "role": "confirmation"
            }
          }
        },
        "identity": "confirmation"
      },
      "title": {
        "state": {
          "native": {
            "owner": "confirmation"
          }
        },
        "identity": "title:confirmation"
      }
    }
  },
  "questions": {
    "event-name": {
      "identity": "event-name",
      "label": {
        "state": {
          "native": {
            "owner": "event-name",
            "part": "label"
          }
        },
        "identity": "label:event-name"
      },
      "answer": {
        "state": {
          "native": {
            "question": {
              "id": "event-name",
              "key": "event-name",
              "kind": "text",
              "required": {
                "value": true,
                "message": "Enter an answer"
              },
              "type": "question"
            },
            "owner": "event-name",
            "part": "input"
          }
        },
        "identity": "input:event-name"
      }
    },
    "event-parish": {
      "identity": "event-parish",
      "label": {
        "state": {
          "native": {
            "owner": "event-parish",
            "part": "label"
          }
        },
        "identity": "label:event-parish"
      }
    },
    "event-date": {
      "identity": "event-date",
      "label": {
        "state": {
          "native": {
            "owner": "event-date",
            "part": "label"
          }
        },
        "identity": "label:event-date"
      },
      "answer": {
        "state": {
          "native": {
            "question": {
              "id": "event-date",
              "key": "event-date",
              "kind": "date",
              "required": {
                "value": true,
                "message": "Enter an answer"
              },
              "validation": [
                {
                  "id": "future-or-today",
                  "type": "dateAfter",
                  "value": {
                    "context": "today"
                  },
                  "inclusive": true,
                  "message": "Enter today or a future date"
                }
              ],
              "type": "question"
            },
            "owner": "event-date",
            "part": "input"
          }
        },
        "identity": "input:event-date"
      }
    },
    "national-id-number": {
      "identity": "national-id-number",
      "label": {
        "state": {
          "native": {
            "owner": "national-id-number",
            "part": "label"
          }
        },
        "identity": "label:national-id-number"
      },
      "answer": {
        "state": {
          "native": {
            "question": {
              "kind": "text",
              "required": {
                "value": true,
                "message": "Enter your National ID number"
              },
              "config": {
                "width": "medium",
                "mask": "999999-9999"
              },
              "validation": [
                {
                  "id": "pattern",
                  "type": "pattern",
                  "pattern": "^\\d{6}-\\d{4}$",
                  "flags": "u",
                  "message": "Enter a valid National ID number (for example, 900314-0052)"
                }
              ],
              "id": "national-id-number",
              "type": "question",
              "key": "national-id-number"
            },
            "owner": "national-id-number",
            "part": "input"
          }
        },
        "identity": "input:national-id-number"
      }
    },
    "passport-number": {
      "identity": "passport-number",
      "label": {
        "state": {
          "native": {
            "owner": "passport-number",
            "part": "label"
          }
        },
        "identity": "label:passport-number"
      },
      "answer": {
        "state": {
          "native": {
            "question": {
              "kind": "text",
              "required": {
                "value": true,
                "message": "Enter passport number"
              },
              "config": {
                "width": "short"
              },
              "validation": [
                {
                  "id": "minLength",
                  "type": "minLength",
                  "value": 6,
                  "message": "Passport number must be at least 6 characters"
                }
              ],
              "id": "passport-number",
              "type": "question",
              "key": "passport-number",
              "layout": {
                "under": {
                  "block": "passport-help"
                }
              }
            },
            "owner": "passport-number",
            "part": "input"
          }
        },
        "identity": "input:passport-number"
      }
    },
    "closure-duration": {
      "identity": "closure-duration",
      "label": {
        "state": {
          "native": {
            "owner": "closure-duration",
            "part": "label"
          }
        },
        "identity": "label:closure-duration"
      },
      "answer": {
        "state": {
          "native": {
            "question": {
              "id": "closure-duration",
              "key": "closure-duration",
              "kind": "text",
              "required": {
                "value": true,
                "message": "Enter an answer"
              },
              "visible": false,
              "layout": {
                "under": {
                  "question": "close-road",
                  "option": "yes"
                }
              },
              "type": "question"
            },
            "owner": "closure-duration",
            "part": "input"
          }
        },
        "identity": "input:closure-duration"
      }
    },
    "close-road": {
      "identity": "close-road",
      "label": {
        "state": {
          "native": {
            "owner": "close-road",
            "part": "label"
          }
        },
        "identity": "label:close-road"
      }
    },
    "roads": {
      "identity": "roads",
      "label": {
        "state": {
          "native": {
            "owner": "roads",
            "part": "label"
          }
        },
        "identity": "label:roads"
      },
      "answer": {
        "state": {
          "native": {
            "question": {
              "id": "roads",
              "key": "roads",
              "kind": "long-text",
              "required": {
                "value": false,
                "message": "Enter the roads"
              },
              "type": "question"
            },
            "owner": "roads",
            "part": "input"
          }
        },
        "identity": "input:roads"
      }
    },
    "site-plan": {
      "identity": "site-plan",
      "label": {
        "state": {
          "native": {
            "owner": "site-plan",
            "part": "label"
          }
        },
        "identity": "label:site-plan"
      },
      "answer": {
        "state": {
          "native": {
            "question": {
              "id": "site-plan",
              "key": "site-plan",
              "kind": "file",
              "required": {
                "value": true,
                "message": "Enter an answer"
              },
              "type": "question"
            },
            "owner": "site-plan",
            "part": "input"
          }
        },
        "identity": "input:site-plan"
      }
    },
    "sound-type": {
      "identity": "sound-type",
      "label": {
        "state": {
          "native": {
            "owner": "sound-type",
            "part": "label"
          }
        },
        "identity": "label:sound-type"
      },
      "answer": {
        "state": {
          "native": {
            "question": {
              "id": "sound-type",
              "key": "sound-type",
              "kind": "text",
              "required": {
                "value": true,
                "message": "Enter an answer"
              },
              "type": "question"
            },
            "owner": "sound-type",
            "part": "input"
          }
        },
        "identity": "input:sound-type"
      }
    },
    "speakers": {
      "identity": "speakers",
      "label": {
        "state": {
          "native": {
            "owner": "speakers",
            "part": "label"
          }
        },
        "identity": "label:speakers"
      },
      "answer": {
        "state": {
          "native": {
            "question": {
              "id": "speakers",
              "key": "speakers",
              "kind": "number",
              "required": {
                "value": true,
                "message": "Enter an answer"
              },
              "type": "question"
            },
            "owner": "speakers",
            "part": "input"
          }
        },
        "identity": "input:speakers"
      }
    },
    "speaker-brand": {
      "settings": {
        "fieldArray": {
          "min": 1,
          "max": 4,
          "addAnotherLabel": "Add another speaker brand"
        }
      },
      "identity": "speaker-brand",
      "label": {
        "state": {
          "native": {
            "owner": "speaker-brand",
            "part": "label"
          }
        },
        "identity": "label:speaker-brand"
      },
      "answer": {
        "state": {
          "native": {
            "question": {
              "id": "speaker-brand",
              "key": "speaker-brand",
              "kind": "text",
              "required": {
                "value": true,
                "message": "Enter an answer"
              },
              "repeat": {
                "min": 1,
                "max": 4,
                "addLabel": "Add another speaker brand"
              },
              "type": "question"
            },
            "owner": "speaker-brand",
            "part": "input"
          }
        },
        "identity": "input:speaker-brand"
      }
    },
    "declaration-confirmation": {
      "identity": "declaration-confirmation",
      "label": {
        "state": {
          "native": {
            "owner": "declaration-confirmation",
            "part": "label"
          }
        },
        "identity": "label:declaration-confirmation"
      }
    }
  },
  "nodes": {
    "use-this-form-to-apply-for-a-permit-for-an-event-with-amplif": {
      "state": {
        "native": {
          "content": {
            "id": "intro",
            "kind": "paragraph",
            "type": "content"
          }
        }
      },
      "identity": "intro"
    },
    "you-will-need": {
      "state": {
        "native": {
          "content": {
            "id": "need",
            "kind": "paragraph",
            "type": "content"
          }
        }
      },
      "identity": "need"
    },
    "paragraph": {
      "state": {
        "native": {
          "content": {
            "id": "need-list",
            "kind": "list",
            "config": {
              "ordered": false
            },
            "type": "content"
          },
          "owner": "need-list",
          "part": "list-content"
        }
      },
      "identity": "need-list"
    },
    "the-date-and-address-of-the-event": {
      "state": {
        "native": {
          "content": {
            "id": "need-list",
            "kind": "list",
            "config": {
              "ordered": false
            },
            "type": "content"
          },
          "listItem": {
            "id": "date-address"
          },
          "owner": "need-list",
          "part": "list-item"
        }
      },
      "identity": "item:need-list:date-address"
    },
    "a-site-plan-if-you-need-to-close-a-road": {
      "state": {
        "native": {
          "content": {
            "id": "need-list",
            "kind": "list",
            "config": {
              "ordered": false
            },
            "type": "content"
          },
          "listItem": {
            "id": "site-plan"
          },
          "owner": "need-list",
          "part": "list-item"
        }
      },
      "identity": "item:need-list:site-plan"
    },
    "christ-church": {
      "state": {
        "native": {
          "question": {
            "id": "event-parish",
            "key": "event-parish",
            "kind": "choice",
            "required": {
              "value": true,
              "message": "Enter an answer"
            },
            "config": {
              "selection": "single",
              "presentation": "dropdown"
            },
            "type": "question"
          },
          "option": {
            "id": "christ-church",
            "value": "Christ Church"
          },
          "owner": "event-parish",
          "part": "option"
        }
      },
      "identity": "option:event-parish:christ-church"
    },
    "saint-michael": {
      "state": {
        "native": {
          "question": {
            "id": "event-parish",
            "key": "event-parish",
            "kind": "choice",
            "required": {
              "value": true,
              "message": "Enter an answer"
            },
            "config": {
              "selection": "single",
              "presentation": "dropdown"
            },
            "type": "question"
          },
          "option": {
            "id": "saint-michael",
            "value": "Saint Michael"
          },
          "owner": "event-parish",
          "part": "option"
        }
      },
      "identity": "option:event-parish:saint-michael"
    },
    "event-date:hint-1": {
      "state": {
        "native": {
          "owner": "event-date",
          "part": "hint",
          "hintShape": "rich"
        }
      },
      "identity": "hint:event-date"
    },
    "national-id-number:hint-1": {
      "state": {
        "native": {
          "owner": "national-id-number",
          "part": "hint",
          "hintShape": "rich"
        }
      },
      "identity": "hint:national-id-number"
    },
    "if-you-don-t-have-a-national-id-number-you-can-use-your-pass": {
      "state": {
        "native": {
          "content": {
            "id": "passport-intro",
            "kind": "paragraph",
            "type": "content"
          },
          "container": "passport-help"
        }
      },
      "identity": "passport-intro"
    },
    "use-passport-number-instead": {
      "state": {
        "native": {
          "content": {
            "id": "passport-help",
            "kind": "expandable",
            "config": {},
            "type": "content"
          }
        }
      },
      "identity": "passport-help"
    },
    "apply-at-least-14-days-before-the-event-if-you-need-to-close": {
      "settings": {
        "hidden": true
      },
      "state": {
        "native": {
          "content": {
            "id": "closure-warning",
            "kind": "callout",
            "config": {
              "tone": "warning"
            },
            "visible": false,
            "layout": {
              "under": {
                "question": "close-road",
                "option": "yes"
              }
            },
            "type": "content"
          }
        }
      },
      "identity": "closure-warning"
    },
    "yes": {
      "state": {
        "native": {
          "question": {
            "id": "close-road",
            "key": "close-road",
            "kind": "choice",
            "required": {
              "value": true,
              "message": "Enter an answer"
            },
            "config": {
              "selection": "single",
              "presentation": "radio"
            },
            "type": "question"
          },
          "option": {
            "id": "yes",
            "value": "Yes"
          },
          "owner": "close-road",
          "part": "option"
        }
      },
      "identity": "option:close-road:yes"
    },
    "no": {
      "state": {
        "native": {
          "question": {
            "id": "close-road",
            "key": "close-road",
            "kind": "choice",
            "required": {
              "value": true,
              "message": "Enter an answer"
            },
            "config": {
              "selection": "single",
              "presentation": "radio"
            },
            "type": "question"
          },
          "option": {
            "id": "no",
            "value": "No"
          },
          "owner": "close-road",
          "part": "option"
        }
      },
      "identity": "option:close-road:no"
    },
    "conditional-logic": {
      "state": {
        "native": {
          "logic": {
            "id": "closure-follow-up",
            "rules": [
              {
                "id": "show-closure",
                "when": {
                  "op": "selected",
                  "question": "close-road",
                  "option": "yes"
                },
                "actions": [
                  {
                    "type": "setVisible",
                    "targets": [
                      "closure-duration",
                      "closure-warning"
                    ],
                    "value": true
                  }
                ]
              }
            ],
            "type": "logic"
          }
        }
      },
      "identity": "closure-follow-up"
    },
    "i-confirm-the-information-i-have-given-is-correct": {
      "state": {
        "native": {
          "question": {
            "id": "declaration-confirmation",
            "key": "declaration-confirmation",
            "kind": "choice",
            "required": {
              "value": true,
              "message": "You must confirm the declaration to continue"
            },
            "config": {
              "selection": "multiple",
              "presentation": "checkboxes"
            },
            "type": "question"
          },
          "option": {
            "id": "confirm",
            "value": "confirmed"
          },
          "owner": "declaration-confirmation",
          "part": "option"
        }
      },
      "identity": "option:declaration-confirmation:confirm"
    },
    "application-sent-2": {
      "state": {
        "native": {
          "content": {
            "id": "sent-title",
            "kind": "question-label",
            "type": "content"
          }
        }
      },
      "identity": "sent-title"
    },
    "we-will-email-you-within-5-working-days": {
      "state": {
        "native": {
          "content": {
            "id": "sent-message",
            "kind": "paragraph",
            "type": "content"
          }
        }
      },
      "identity": "sent-message"
    },
    "what-happens-next": {
      "state": {
        "native": {
          "content": {
            "id": "next-title",
            "kind": "heading",
            "config": {
              "level": 2
            },
            "type": "content"
          }
        }
      },
      "identity": "next-title"
    },
    "paragraph-2": {
      "state": {
        "native": {
          "content": {
            "id": "next-steps",
            "kind": "list",
            "config": {
              "ordered": true
            },
            "type": "content"
          },
          "owner": "next-steps",
          "part": "list-content"
        }
      },
      "identity": "next-steps"
    },
    "we-check-your-application": {
      "state": {
        "native": {
          "content": {
            "id": "next-steps",
            "kind": "list",
            "config": {
              "ordered": true
            },
            "type": "content"
          },
          "listItem": {
            "id": "check"
          },
          "owner": "next-steps",
          "part": "list-item"
        }
      },
      "identity": "item:next-steps:check"
    },
    "we-may-call-you-to-ask-about-the-event": {
      "state": {
        "native": {
          "content": {
            "id": "next-steps",
            "kind": "list",
            "config": {
              "ordered": true
            },
            "type": "content"
          },
          "listItem": {
            "id": "call"
          },
          "owner": "next-steps",
          "part": "list-item"
        }
      },
      "identity": "item:next-steps:call"
    },
    "we-email-you-your-permit": {
      "state": {
        "native": {
          "content": {
            "id": "next-steps",
            "kind": "list",
            "config": {
              "ordered": true
            },
            "type": "content"
          },
          "listItem": {
            "id": "email"
          },
          "owner": "next-steps",
          "part": "list-item"
        }
      },
      "identity": "item:next-steps:email"
    }
  }
}
```
:::
