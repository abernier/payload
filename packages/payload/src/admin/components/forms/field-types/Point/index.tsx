import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import type { Props } from './types'

import { point } from '../../../../../fields/validations'
import { getTranslation } from '../../../../../utilities/getTranslation'
import DefaultError from '../../Error'
import FieldDescription from '../../FieldDescription'
import DefaultLabel from '../../Label'
import useField from '../../useField'
import withCondition from '../../withCondition'
import './index.scss'
import { fieldBaseClass } from '../shared'

const baseClass = 'point'

const PointField: React.FC<Props> = (props) => {
  const {
    name,
    admin: {
      className,
      condition,
      description,
      placeholder,
      readOnly,
      step,
      style,
      width,
      components: { Error, Label, BeforeInput, AfterInput } = {},
    } = {},
    label,
    path: pathFromProps,
    required,
    validate = point,
  } = props

  const ErrorComp = Error || DefaultError
  const LabelComp = Label || DefaultLabel

  const path = pathFromProps || name

  const { i18n, t } = useTranslation('fields')

  const memoizedValidate = useCallback(
    (value, options) => {
      return validate(value, { ...options, required })
    },
    [validate, required],
  )

  const {
    errorMessage,
    setValue,
    showError,
    value = [null, null],
  } = useField<[number, number]>({
    condition,
    path,
    validate: memoizedValidate,
  })

  const handleChange = useCallback(
    (e, index: 0 | 1) => {
      let val = parseFloat(e.target.value)
      if (Number.isNaN(val)) {
        val = e.target.value
      }
      const coordinates = [...value]
      coordinates[index] = val
      setValue(coordinates)
    },
    [setValue, value],
  )

  return (
    <div
      className={[
        fieldBaseClass,
        baseClass,
        className,
        showError && 'error',
        readOnly && 'read-only',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        ...style,
        width,
      }}
    >
      <ErrorComp message={errorMessage} showError={showError} />
      <ul className={`${baseClass}__wrap`}>
        <li>
          <LabelComp
            htmlFor={`field-longitude-${path.replace(/\./g, '__')}`}
            label={`${getTranslation(label || name, i18n)} - ${t('longitude')}`}
            required={required}
          />
          <div className="input-wrapper">
            {BeforeInput}
            <input
              disabled={readOnly}
              id={`field-longitude-${path.replace(/\./g, '__')}`}
              name={`${path}.longitude`}
              onChange={(e) => handleChange(e, 0)}
              placeholder={getTranslation(placeholder, i18n)}
              step={step}
              type="number"
              value={value && typeof value[0] === 'number' ? value[0] : ''}
            />
            {AfterInput}
          </div>
        </li>
        <li>
          <LabelComp
            htmlFor={`field-latitude-${path.replace(/\./g, '__')}`}
            label={`${getTranslation(label || name, i18n)} - ${t('latitude')}`}
            required={required}
          />
          <div className="input-wrapper">
            {BeforeInput}
            <input
              disabled={readOnly}
              id={`field-latitude-${path.replace(/\./g, '__')}`}
              name={`${path}.latitude`}
              onChange={(e) => handleChange(e, 1)}
              placeholder={getTranslation(placeholder, i18n)}
              step={step}
              type="number"
              value={value && typeof value[1] === 'number' ? value[1] : ''}
            />
            {AfterInput}
          </div>
        </li>
      </ul>
      <FieldDescription description={description} value={value} />
    </div>
  )
}

export default withCondition(PointField)
