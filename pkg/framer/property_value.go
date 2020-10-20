package framer

import (
	"context"
	"fmt"

	resource2 "github.com/grafana/iot-sitewise-datasource/pkg/sitewise/resource"

	"github.com/aws/aws-sdk-go/service/iotsitewise"
	"github.com/grafana/grafana-plugin-sdk-go/data"
)

type AssetPropertyValue iotsitewise.GetAssetPropertyValueOutput

func (a AssetPropertyValue) Rows() [][]interface{} {
	rows := [][]interface{}{
		{getTime(a.PropertyValue.Timestamp), getPropertyVariantValue(a.PropertyValue.Value)},
	}

	fmt.Println(rows)
	return rows
}

func (p AssetPropertyValue) Frames(ctx context.Context, resources resource2.ResourceProvider) (data.Frames, error) {

	length := 1

	property, err := resources.Property(ctx)
	if err != nil {
		return nil, err
	}

	timeField := data.NewFieldFromFieldType(data.FieldTypeTime, length)
	timeField.Name = "time"

	valueField := data.NewFieldFromFieldType(fieldTypeForPropertyValue(property), length)
	valueField.Name = *property.AssetProperty.Name

	frame := data.NewFrame(*property.AssetName, timeField, valueField)

	timeField.Set(0, getTime(p.PropertyValue.Timestamp))
	valueField.Set(0, getPropertyVariantValue(p.PropertyValue.Value))

	return data.Frames{frame}, nil
}
